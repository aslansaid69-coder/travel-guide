import { randomUUID } from "node:crypto";
import { database } from "@/lib/db";
import type { WeatherData } from "@/lib/weather/types";
import { adapters, clothingAdapter, clothingResult } from "./adapters";
import { runAdapters, updateRunKey } from "./engine";
import { beginRun, finishRun, lease, release, saveResult, logBusyRun } from "./store";
import { drainAlerts } from "./alerts";
export async function runUpdate(
  job: "daily" | "weather",
  actor: string,
  manual = false,
) {
  const now = new Date();
  const id = updateRunKey(job, now, manual);
  const owner = randomUUID();
  if (!(await lease(owner))) {
    await logBusyRun(`${id}:busy:${owner}`, job, actor);
    return { ok: false, busy: true, id };
  }
  try {
    if (!(await beginRun(id, job, actor)))
      return { ok: true, skipped: true, id };
    try {
      const items = adapters().filter(
        (a) => job === "daily" || a.kind === "weather",
      );
      const results = await runAdapters(items, (adapter, result, duration) =>
        saveResult(id, adapter, result, duration),
      );
      const weather = results.find((r) => r.kind === "weather");
      const clothing =
        weather?.status === "success"
          ? clothingResult(weather.data as WeatherData)
          : {
              status:
                weather?.status === "not_configured"
                  ? ("not_configured" as const)
                  : ("failed" as const),
              reason:
                "Fresh weather was unavailable; previous clothing advice retained.",
              requests: 0,
            };
      await saveResult(id, clothingAdapter, clothing, 0);
      // External records are candidates. A feed refresh cannot silently publish new places, menus, prices or events.
      const sql = database();
      for (const result of results.filter(
        (r) => r.status === "success" && r.key.includes(".feed."),
      )) {
        for (const entry of result.data as { id: string }[])
          await sql`INSERT INTO content_candidates(source_key,external_id,kind,data) VALUES(${result.key},${entry.id},${result.kind},${JSON.stringify(entry)}::jsonb) ON CONFLICT(source_key,external_id) DO UPDATE SET published_data=CASE WHEN content_candidates.status='approved' THEN COALESCE(content_candidates.published_data,content_candidates.data) ELSE content_candidates.published_data END,status=CASE WHEN content_candidates.data IS DISTINCT FROM EXCLUDED.data THEN 'pending' ELSE content_candidates.status END,data=EXCLUDED.data,updated_at=now()`;
      }
      const failures = results.filter((r) => r.status === "failed");
      const needs = weather?.status === "not_configured";
      const status = failures.length
        ? "failed"
        : needs
          ? "needs_configuration"
          : results.some((r) => r.status === "not_configured")
            ? "partial"
            : "success";
      const summary = {
        successful: results
          .filter((r) => r.status === "success")
          .map((r) => r.key),
        failed: failures.map((r) => ({ source: r.key, reason: r.reason })),
        notConfigured: results
          .filter((r) => r.status === "not_configured")
          .map((r) => r.key),
      };
      await finishRun(id, job, status, summary, failures.length > 0);
      try {
        await drainAlerts();
      } catch {
        /* Delivery retry state is durable and does not invalidate source updates. */
      }
      return { ok: !failures.length, id, status, ...summary };
    } catch {
      await finishRun(
        id,
        job,
        "failed",
        { reason: "Update worker failed; previous snapshots retained." },
        true,
      );
      try {
        await drainAlerts();
      } catch {
        /* Outbox persists until next run. */
      }
      throw new Error("Update worker failed.");
    }
  } finally {
    await release(owner);
  }
}
