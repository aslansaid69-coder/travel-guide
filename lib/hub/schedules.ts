import { settings } from "./store";
import { runUpdate } from "@/lib/updates/jobs";
export async function dailyAtConfiguredHour() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Almaty",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  if (hour < (await settings()).dailyHour) return { skipped: true };
  return runUpdate("daily", "schedule-router");
}
