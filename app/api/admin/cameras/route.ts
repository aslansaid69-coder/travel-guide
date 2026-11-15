import { randomUUID } from "node:crypto";
import { ownerSession, sameOrigin } from "@/lib/auth/owner";
import { database } from "@/lib/db";
import {
  listCameras,
  recentLogs,
  recordProbe,
  audit,
} from "@/lib/cameras/store";
import { probeCamera } from "@/lib/cameras/probe";
import { validateCameraUrl, cameraHosts } from "@/lib/cameras/policy";
import { checkCameras } from "@/lib/cameras/jobs";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET() {
  const owner = await ownerSession();
  if (!owner)
    return Response.json({ error: "Owner access required." }, { status: 401 });
  return Response.json(
    { cameras: await listCameras(), ...(await recentLogs()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  const owner = await ownerSession();
  if (!owner)
    return Response.json({ error: "Owner access required." }, { status: 401 });
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid origin." }, { status: 403 });
  try {
    if (Number(request.headers.get("content-length") || 0) > 12000)
      throw new Error("Request too large.");
    const body = await request.json();
    const sql = database();
    if (body.action === "check")
      return Response.json(await checkCameras(owner.id));
    if (body.action === "add") {
      if ((await listCameras()).length >= 24)
        throw new Error(
          "Camera limit reached. Review capacity before adding more than 24 streams.",
        );
      if (body.permissionConfirmed !== true)
        throw new Error(
          "Confirm the operator permits embedding before publishing.",
        );
      for (const key of ["name", "location", "sourceName", "permissionNote"])
        if (
          typeof body[key] !== "string" ||
          body[key].trim().length < 2 ||
          body[key].length > 500
        )
          throw new Error("Complete all camera and permission details.");
      const streamUrl = validateCameraUrl(body.streamUrl, cameraHosts()).href;
      const sourceUrl = validateCameraUrl(body.sourceUrl, cameraHosts()).href;
      const config = {
        id: randomUUID(),
        name: body.name.trim(),
        location: body.location.trim(),
        type: "hls",
        streamUrl,
        sourceUrl,
        sourceName: body.sourceName.trim(),
        permissionNote: body.permissionNote.trim(),
        poster: "/images/hero.jpg",
        posterAlt: "Tian Shan scenic photograph, not a live frame",
      };
      const result = await probeCamera(config);
      if (!result.ok) throw new Error(result.reason);
      await sql`INSERT INTO cameras(id,config) VALUES(${config.id},${JSON.stringify(config)}::jsonb)`;
      await recordProbe(config.id, result, owner.id);
      await audit(owner.id, "camera.add", config.id);
      return Response.json({ ok: true });
    }
    const camera = (await listCameras()).find((c) => c.id === body.id);
    if (!camera) throw new Error("Camera not found.");
    if (body.action === "hide")
      await sql`UPDATE cameras SET manual_hidden=true,status='hidden',reason='Hidden by owner.' WHERE id=${camera.id}`;
    else if (body.action === "show") {
      if (camera.blocked)
        throw new Error(
          "Blocked-provider cameras cannot be restored. Add a reviewed replacement.",
        );
      const result = await probeCamera(camera);
      if (!result.ok) throw new Error(result.reason);
      await sql`UPDATE cameras SET manual_hidden=false,failures=0 WHERE id=${camera.id}`;
      await recordProbe(camera.id, result, owner.id);
    } else throw new Error("Unknown action.");
    await audit(owner.id, `camera.${body.action}`, camera.id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to update camera.",
      },
      { status: 400 },
    );
  }
}
