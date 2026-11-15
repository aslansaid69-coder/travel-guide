import { Client } from "@upstash/qstash";
const token = process.env.QSTASH_TOKEN;
const url = process.env.NEXT_PUBLIC_SITE_URL;
if (
  !token ||
  !url ||
  !process.env.QSTASH_CURRENT_SIGNING_KEY ||
  !process.env.QSTASH_NEXT_SIGNING_KEY
)
  throw new Error(
    "Configure QStash token, both signing keys, and NEXT_PUBLIC_SITE_URL first.",
  );
const client = new Client({ token });
for (const [job, id, cron] of [
  ["cameras", "almaty-camera-health", "*/15 * * * *"],
  ["daily", "almaty-daily-updates", "CRON_TZ=Asia/Almaty 0 5 * * *"],
  ["weather", "almaty-hourly-weather", "17 * * * *"],
]) {
  const schedule = await client.schedules.create({
    destination: `${url}/api/jobs/${job}`,
    scheduleId: id,
    cron,
    retries: 0,
  });
  console.log("Configured schedule:", schedule.scheduleId);
}
