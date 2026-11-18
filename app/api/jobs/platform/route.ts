import { schedulerAllowed } from "@/lib/updates/scheduler";
import { platformTick } from "@/lib/platform/jobs";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (!(await schedulerAllowed(request, "platform")))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await platformTick();
    return Response.json(result, { status: result.ok === false ? 503 : 200 });
  } catch {
    return Response.json(
      { error: "Operations job failed; durable records retained." },
      { status: 503 },
    );
  }
}
