import { timingSafeEqual } from "node:crypto";
import { Receiver } from "@upstash/qstash";
import { githubScheduleToken } from "@/lib/cameras/scheduler-auth";
export async function schedulerAllowed(
  request: Request,
  job: "daily" | "weather" | "platform",
) {
  const auth = request.headers.get("authorization") || "";
  const actual = Buffer.from(auth),
    expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  if (
    process.env.CRON_SECRET &&
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  )
    return true;
  if (
    request.headers.get("x-scheduler") === "github-actions" &&
    (await githubScheduleToken(auth.replace(/^Bearer /, ""), job))
  )
    return true;
  if (
    process.env.QSTASH_CURRENT_SIGNING_KEY &&
    process.env.QSTASH_NEXT_SIGNING_KEY
  ) {
    try {
      return await new Receiver({
        currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
      }).verify({
        signature: request.headers.get("upstash-signature") || "",
        body: await request.text(),
        url: `${process.env.NEXT_PUBLIC_SITE_URL}/api/jobs/${job}`,
      });
    } catch {
      return false;
    }
  }
  return false;
}
