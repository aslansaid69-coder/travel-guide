import { getEvents } from "@/lib/events";
export const dynamic = "force-dynamic";
export async function GET() {
  const { events, fetchedAt, warnings } = await getEvents();
  return Response.json(
    {
      events,
      fetchedAt,
      sourceStatus: warnings.length
        ? "Some sources unavailable; curated events retained."
        : "ok",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
