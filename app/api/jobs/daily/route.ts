import { settings } from "@/lib/hub/store";
import { schedulerAllowed } from "@/lib/updates/scheduler";
import { runUpdate } from "@/lib/updates/jobs";
import { revalidatePath, revalidateTag } from "next/cache";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!(await schedulerAllowed(request, "daily")))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const manual =
      request.headers.get("x-update-trigger") === "workflow_dispatch";
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Almaty",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date()),
    );
    if (!manual && hour < (await settings()).dailyHour)
      return Response.json({
        ok: true,
        skipped: true,
        reason: "Waiting for the owner-configured daily hour.",
      });
    const result = await runUpdate(
      "daily",
      "scheduler",
      request.headers.get("x-update-trigger") === "workflow_dispatch",
    );
    revalidatePath("/");
    revalidateTag("events", { expire: 0 });
    return Response.json(result, {
      status: result.busy ? 409 : result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Update failed. Last-good snapshots retained; see owner log." },
      { status: 503 },
    );
  }
}
