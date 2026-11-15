import { database } from "@/lib/db";
import { listCameras, recordProbe } from "./store";
import { probeCamera } from "./probe";
export async function checkCameras(actor: string) {
  const sql = database();
  // One durable claim per 15-minute window. Scheduler retries and manual runs cannot inflate failure counts.
  const id = `cameras:${Math.floor(Date.now() / 900000)}`;
  const claimed =
    await sql`INSERT INTO job_runs(id,job) VALUES(${id},'cameras') ON CONFLICT DO NOTHING RETURNING id`;
  if (!claimed.length)
    return {
      skipped: true,
      reason: "This 15-minute window has already been checked.",
    };
  try {
    const cameras = await listCameras();
    let checked = 0,
      failed = 0;
    await Promise.all(
      cameras.map(async (camera) => {
        if (camera.blocked) return; // A banned-provider incident can only be addressed through an owner-reviewed replacement.
        const result = await probeCamera(camera, camera.manifestHash);
        await recordProbe(camera.id, result, actor);
        checked++;
        if (!result.ok) failed++;
      }),
    );
    await sql`UPDATE job_runs SET finished_at=now(),status='success',details=${JSON.stringify({ checked, failed })}::jsonb WHERE id=${id}`;
    // Bounded retention; do not keep every segment check forever.
    await sql`DELETE FROM camera_checks WHERE checked_at<now()-interval '30 days'`;
    return { checked, failed };
  } catch (error) {
    await sql`UPDATE job_runs SET finished_at=now(),status='failed',details=${JSON.stringify({ reason: error instanceof Error ? error.message : "Camera check failed" })}::jsonb WHERE id=${id}`;
    throw error;
  }
}
