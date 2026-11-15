import { schedulerAllowed } from "@/lib/updates/scheduler";
import { runUpdate } from "@/lib/updates/jobs";
import { revalidatePath, revalidateTag } from "next/cache";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!(await schedulerAllowed(request, "weather")))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runUpdate(
      "weather",
      "scheduler",
      request.headers.get("x-update-trigger") === "workflow_dispatch",
    );
    revalidatePath("/");
    revalidateTag("events", { expire: 0 });
    return Response.json(result, {
      status: result.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Update failed. Last-good snapshots retained; see owner log." },
      { status: 503 },
    );
  }
}
