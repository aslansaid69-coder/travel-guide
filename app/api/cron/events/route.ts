// Compatibility alias for the retired cache-only cron. New schedules use /api/jobs/daily.
import { POST } from "@/app/api/jobs/daily/route";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = POST;
