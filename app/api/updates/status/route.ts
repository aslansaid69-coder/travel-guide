import { database } from "@/lib/db";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const sql = database();
    const rows =
      await sql`SELECT source_key,kind,status,last_success FROM source_snapshots WHERE source_key IN ('weather.open-meteo','clothing.rules','events.curated','places.curated') ORDER BY source_key`;
    return Response.json(
      { sources: rows },
      {
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60",
        },
      },
    );
  } catch {
    return Response.json({ sources: [] }, { status: 503 });
  }
}
