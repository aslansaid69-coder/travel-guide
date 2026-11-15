import { ownerSession, sameOrigin } from "@/lib/auth/owner";
import { runUpdate } from "@/lib/updates/jobs";
import { updateDashboard } from "@/lib/updates/store";
import { emailAlertsConfigured } from "@/lib/updates/alerts";
import { revalidatePath } from "next/cache";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET() {
  if (!(await ownerSession()))
    return Response.json({ error: "Owner access required." }, { status: 401 });
  try {
    return Response.json(
      {
        ...(await updateDashboard()),
        emailAlertsConfigured: emailAlertsConfigured(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Update log temporarily unavailable." },
      { status: 503 },
    );
  }
}
export async function POST(request: Request) {
  const owner = await ownerSession();
  if (!owner)
    return Response.json({ error: "Owner access required." }, { status: 401 });
  if (!sameOrigin(request))
    return Response.json({ error: "Invalid origin." }, { status: 403 });
  try {
    const result = await runUpdate("daily", owner.id, true);
    revalidatePath("/");
    return Response.json(result, { status: result.ok ? 200 : 503 });
  } catch {
    return Response.json(
      { error: "Update failed. Previous data retained." },
      { status: 503 },
    );
  }
}
