import { database } from "@/lib/db";
import type { Camera, CameraConfig, ProbeResult } from "./types";
function fromRow(row: Record<string, unknown>): Camera {
  return {
    ...(row.config as CameraConfig),
    status: row.status as Camera["status"],
    failures: Number(row.failures),
    manualHidden: !!row.manual_hidden,
    blocked: !!row.blocked,
    lastCheck: row.last_check
      ? new Date(row.last_check as string).toISOString()
      : null,
    reason: row.reason as string | null,
    manifestHash: row.manifest_hash as string | null,
  };
}
export async function listCameras() {
  const sql = database();
  return (
    await sql`SELECT id,config,status,failures,manual_hidden,blocked,last_check,reason,manifest_hash FROM cameras ORDER BY id`
  ).map(fromRow);
}
export function publicCamera(camera: Camera) {
  const { manifestHash, permissionNote, ...publicFields } = camera;
  void manifestHash;
  void permissionNote;
  return publicFields;
}
export async function recordProbe(
  id: string,
  result: ProbeResult,
  actor: string,
) {
  const sql = database();
  await sql.transaction([
    sql`UPDATE cameras SET failures=CASE WHEN ${result.ok} THEN 0 ELSE failures+1 END,
      blocked=blocked OR ${!!result.blocked},
      status=CASE WHEN blocked OR ${!!result.blocked} OR manual_hidden OR (NOT ${result.ok} AND failures+1>=3) THEN 'hidden' WHEN ${result.ok} THEN 'online' ELSE 'offline' END,
      reason=CASE WHEN blocked OR ${!!result.blocked} THEN 'Blocked provider or redirect. Owner review required.' WHEN manual_hidden THEN 'Hidden by owner.' WHEN ${result.ok} THEN NULL ELSE ${result.reason} END,
      last_check=now(),manifest_hash=COALESCE(${result.manifestHash || null},manifest_hash),updated_at=now() WHERE id=${id}`,
    sql`INSERT INTO camera_checks(camera_id,ok,reason,final_url,actor) VALUES(${id},${result.ok},${result.reason},${result.finalUrl || null},${actor})`,
  ]);
}
export async function recentLogs() {
  const sql = database();
  return {
    checks:
      await sql`SELECT camera_id,checked_at,ok,reason FROM camera_checks ORDER BY checked_at DESC LIMIT 60`,
    jobs: await sql`SELECT id,job,started_at,finished_at,status,details FROM job_runs ORDER BY started_at DESC LIMIT 20`,
  };
}
export async function audit(actor: string, action: string, id: string) {
  const sql = database();
  await sql`INSERT INTO admin_audit(actor,action,resource) VALUES(${actor},${action},${id})`;
}
