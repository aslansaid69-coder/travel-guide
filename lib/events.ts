import seed from "@/data/events.json";
import { normalizeEvent, type TravelEvent } from "./event-core";
import { visibleEvents } from "./event-view";
import { readSnapshot } from "./updates/store";
import { database } from "./db";
export async function getEvents() {
  const fallback = seed
    .map(normalizeEvent)
    .filter((e): e is TravelEvent => !!e);
  try {
    const snapshot = await readSnapshot<TravelEvent[]>("events.curated");
    const sql = database();
    const approved =
      await sql`SELECT COALESCE(published_data,data) AS data FROM content_candidates WHERE kind='events' AND (status='approved' OR published_data IS NOT NULL) ORDER BY updated_at DESC LIMIT 500`;
    const records = approved
      .map((r) => normalizeEvent(r.data))
      .filter((e): e is TravelEvent => !!e);
    return {
      events: visibleEvents([...records, ...(snapshot?.data || fallback)]),
      fetchedAt: snapshot?.lastSuccess || null,
      warnings:
        snapshot?.status === "failed"
          ? ["Curated source unavailable; retained approved snapshot."]
          : [],
    };
  } catch {
    return {
      events: visibleEvents(fallback),
      fetchedAt: null,
      warnings: [
        "Live update status unavailable; showing bundled approved events.",
      ],
    };
  }
}
