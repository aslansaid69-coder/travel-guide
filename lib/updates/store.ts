import { randomUUID } from "node:crypto";
import { database } from "@/lib/db";
import type { Adapter, Snapshot, SourceResult } from "./types";
const date = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
export function snapshot(row: Record<string, unknown>): Snapshot {
  return {
    key: String(row.source_key),
    kind: row.kind as Snapshot["kind"],
    label: String(row.label),
    data: row.data ?? null,
    lastSuccess: date(row.last_success),
    lastAttempt: date(row.last_attempt),
    status: String(row.status),
    failures: Number(row.consecutive_failures),
    error: row.last_error as string | null,
    revision: row.revision as string | null,
  };
}
export async function snapshots() {
  const sql = database();
  return (
    await sql`SELECT source_key,kind,label,data,last_success,last_attempt,status,consecutive_failures,last_error,revision FROM source_snapshots ORDER BY kind,source_key`
  ).map(snapshot);
}
export async function readSnapshot<T>(
  key: string,
): Promise<Snapshot<T> | null> {
  const sql = database();
  const rows =
    await sql`SELECT source_key,kind,label,data,last_success,last_attempt,status,consecutive_failures,last_error,revision FROM source_snapshots WHERE source_key=${key}`;
  return rows[0] ? (snapshot(rows[0]) as Snapshot<T>) : null;
}
export async function lease(owner: string) {
  const sql = database();
  const rows =
    await sql`INSERT INTO update_leases(name,owner,expires_at) VALUES('content-refresh',${owner},now()+interval '2 minutes') ON CONFLICT(name) DO UPDATE SET owner=EXCLUDED.owner,expires_at=EXCLUDED.expires_at WHERE update_leases.expires_at<now() RETURNING owner`;
  return rows.length > 0;
}
export async function release(owner: string) {
  const sql = database();
  await sql`DELETE FROM update_leases WHERE name='content-refresh' AND owner=${owner}`;
}
export async function beginRun(id: string, job: string, actor: string) {
  const sql = database();
  await sql`UPDATE update_runs SET status='interrupted',finished_at=now(),summary='{"reason":"Worker did not finish within its lease; last-good snapshots retained."}'::jsonb WHERE status='running' AND started_at<now()-interval '3 minutes'`;
  return (
    (
      await sql`INSERT INTO update_runs(id,job,actor) VALUES(${id},${job},${actor}) ON CONFLICT DO NOTHING RETURNING id`
    ).length > 0
  );
}
export async function saveResult(
  runId: string,
  adapter: Pick<Adapter, "key" | "kind" | "label">,
  result: SourceResult,
  duration: number,
) {
  const sql = database();
  const success = result.status === "success",
    failed = result.status === "failed";
  // A failed response updates only health metadata. It never replaces the last-good JSON or its success timestamp.
  await sql.transaction([
    sql`INSERT INTO source_snapshots(source_key,kind,label,data,last_success,last_attempt,status,consecutive_failures,last_error,revision)
    VALUES(${adapter.key},${adapter.kind},${adapter.label},${success ? JSON.stringify(result.data) : null}::jsonb,CASE WHEN ${success} THEN now() ELSE NULL END,now(),${result.status},${failed ? 1 : 0},${success ? null : result.reason},${result.revision || null})
    ON CONFLICT(source_key) DO UPDATE SET label=EXCLUDED.label,
    data=CASE WHEN ${success} THEN EXCLUDED.data ELSE source_snapshots.data END,
    last_success=CASE WHEN ${success} THEN now() ELSE source_snapshots.last_success END,
    last_attempt=now(),status=EXCLUDED.status,
    consecutive_failures=CASE WHEN ${success} THEN 0 WHEN ${failed} THEN source_snapshots.consecutive_failures+1 ELSE source_snapshots.consecutive_failures END,
    last_error=EXCLUDED.last_error,revision=CASE WHEN ${success} THEN EXCLUDED.revision ELSE source_snapshots.revision END`,
    sql`INSERT INTO update_source_runs(run_id,source_key,status,reason,duration_ms,requests) VALUES(${runId},${adapter.key},${result.status},${result.reason},${Math.round(duration)},${result.requests}) ON CONFLICT DO NOTHING`,
  ]);
}
export async function finishRun(
  id: string,
  job: string,
  status: string,
  summary: unknown,
  failed: boolean,
) {
  const sql = database();
  const incident = randomUUID();
  await sql`UPDATE update_runs SET status=${status},summary=${JSON.stringify(summary)}::jsonb,finished_at=now() WHERE id=${id}`;
  if (status === "needs_configuration") return;
  const rows =
    await sql`INSERT INTO update_job_state(job,failures,incident_id,last_run,last_status,last_attempt) VALUES(${job},${failed ? 1 : 0},${failed ? incident : null},${id},${status},now())
   ON CONFLICT(job) DO UPDATE SET failures=CASE WHEN ${failed} THEN update_job_state.failures+1 ELSE 0 END,
   incident_id=CASE WHEN ${failed} THEN COALESCE(update_job_state.incident_id,${incident}) ELSE NULL END,last_run=${id},last_status=${status},last_attempt=now() WHERE update_job_state.last_run IS DISTINCT FROM ${id} RETURNING failures,incident_id`;
  const state = rows[0];
  if (!state) return;
  if (failed && Number(state.failures) >= 2) {
    const alertId = `${job}:${state.incident_id}`;
    await sql`INSERT INTO notification_outbox(id,job,incident_id,subject,body) VALUES(${alertId},${job},${state.incident_id},${`Almaty guide: ${job} failed twice`},${`The ${job} update has failed ${state.failures} consecutive times. Last-good data is retained. Review the update log at https://almaty-travel-guide.vercel.app/admin/updates. Run: ${id}.`}) ON CONFLICT(job,incident_id) DO NOTHING`;
  } else if (!failed)
    await sql`UPDATE notification_outbox SET status='resolved',last_error='Update recovered before this alert was delivered.' WHERE job=${job} AND status NOT IN ('sent','resolved')`;
}
export async function updateDashboard() {
  const sql = database();
  return {
    sources: (
      await sql`SELECT source_key,kind,label,NULL::jsonb AS data,last_success,last_attempt,status,consecutive_failures,last_error,revision FROM source_snapshots ORDER BY kind,source_key`
    ).map(snapshot),
    runs: await sql`SELECT id,job,actor,started_at,finished_at,status,summary FROM update_runs ORDER BY started_at DESC LIMIT 30`,
    results:
      await sql`SELECT r.run_id,r.source_key,r.status,r.reason,r.duration_ms,r.requests FROM update_source_runs r JOIN update_runs u ON u.id=r.run_id ORDER BY u.started_at DESC,r.source_key LIMIT 150`,
    alerts:
      await sql`SELECT id,job,subject,status,attempts,last_error,created_at,sent_at FROM notification_outbox ORDER BY created_at DESC LIMIT 20`,
  };
}
