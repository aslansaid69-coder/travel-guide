import type { TravelEvent } from "./event-core";
export function almatyDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function visibleEvents(
  events: TravelEvent[],
  now = new Date(),
): TravelEvent[] {
  const cutoff = new Date(`${almatyDay(now)}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);
  const cutoffDay = cutoff.toISOString().slice(0, 10);
  const seen = new Set<string>();
  return events
    .filter((e) => {
      const end = e.endDate || e.startDate;
      const day = end.length === 10 ? end : almatyDay(new Date(end));
      if (day < cutoffDay || seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}
