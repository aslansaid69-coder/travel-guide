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
const schedule = await client.schedules.create({
  destination: `${url}/api/jobs/cameras`,
  scheduleId: "almaty-camera-health",
  cron: "*/15 * * * *",
  retries: 0,
});
console.log("Camera health schedule configured:", schedule.scheduleId);
