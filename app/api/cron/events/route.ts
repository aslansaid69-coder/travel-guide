import { timingSafeEqual } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { getEvents } from "@/lib/events";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret || ""}`);
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  revalidateTag("events", { expire: 0 });
  revalidatePath("/");
  const result = await getEvents();
  return Response.json(
    {
      ok: true,
      count: result.events.length,
      fetchedAt: result.fetchedAt,
      warnings: result.warnings,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
