import { Receiver } from "@upstash/qstash";
import { timingSafeEqual } from "node:crypto";
import { githubScheduleToken } from "@/lib/cameras/scheduler-auth";
import { checkCameras } from "@/lib/cameras/jobs";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  let authorised = false;
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`),
    actual = Buffer.from(request.headers.get("authorization") || "");
  if (process.env.CRON_SECRET && expected.length === actual.length)
    authorised = timingSafeEqual(expected, actual);
  if (!authorised && request.headers.get("x-scheduler") === "github-actions")
    authorised = await githubScheduleToken(
      (request.headers.get("authorization") || "").replace(/^Bearer /, ""),
    );
  if (
    !authorised &&
    process.env.QSTASH_CURRENT_SIGNING_KEY &&
    process.env.QSTASH_NEXT_SIGNING_KEY
  ) {
    try {
      const receiver = new Receiver({
        currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
      });
      authorised = await receiver.verify({
        signature: request.headers.get("upstash-signature") || "",
        body: await request.text(),
        url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/jobs/cameras`,
      });
    } catch {
      authorised = false;
    }
  }
  if (!authorised)
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await checkCameras("scheduler")) });
  } catch {
    return Response.json(
      { error: "Camera job failed. Check the owner log." },
      { status: 503 },
    );
  }
}
