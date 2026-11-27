import type { Guide } from "@/lib/platform/types";

/** Day rate used for estimates: hourly rates assume an 8-hour touring day. */
export function guideDayRate(g: Pick<Guide, "rateType" | "rateMinor">) {
  return g.rateType === "hour" ? g.rateMinor * 8 : g.rateMinor;
}

export type Window = { start: Date; end: Date; blocked: boolean };
export type Busy = { start: Date; end: Date };
export type MatchCandidate = {
  guide: Guide;
  windows: Window[];
  busy: Busy[];
  reviewRating: number | null;
  reviewCount: number;
};
export type MatchRequest = {
  regions: string[];
  language?: string;
  start: Date;
  end: Date;
  currency: string;
};
export type Match = {
  guide: Guide;
  dayRateMinor: number;
  rating: number | null;
  reviewCount: number;
  score: number;
  calendarSet: boolean;
  speaksLanguage: boolean;
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+region$/, "");
const overlaps = (a: { start: Date; end: Date }, b: { start: Date; end: Date }) => a.start < b.end && b.start < a.end;

/** A guide covers a region when one of their areas names it (Almaty also covers "Almaty Region"). */
export function coversRegions(areas: string[], regions: string[]) {
  const mine = areas.map(norm);
  return regions.map(norm).every((r) => !r || mine.includes(r) || mine.includes("kazakhstan"));
}

/**
 * True when no blocked window or existing tour overlaps, and either the guide has not
 * published a calendar yet (treated as open, flagged) or available windows cover the trip.
 */
export function isFree(c: Pick<MatchCandidate, "windows" | "busy">, start: Date, end: Date, now = new Date()) {
  const range = { start, end };
  if (c.windows.some((w) => w.blocked && overlaps(w, range))) return false;
  if (c.busy.some((b) => overlaps(b, range))) return false;
  const future = c.windows.filter((w) => !w.blocked && w.end > now);
  if (!future.length) return true;
  // Merge available windows and check they cover [start, end).
  const sorted = future.filter((w) => overlaps(w, range)).sort((a, b) => +a.start - +b.start);
  let cursor = start;
  for (const w of sorted) {
    if (w.start > cursor) return false;
    if (w.end > cursor) cursor = w.end;
    if (cursor >= end) return true;
  }
  return cursor >= end;
}

/** Filters active guides by region, dates, currency and (when given) language; best first. */
export function matchGuides(candidates: MatchCandidate[], req: MatchRequest, now = new Date()): Match[] {
  return candidates
    .filter(({ guide }) => guide.status === "active" && guide.currency === req.currency)
    .filter(({ guide }) => coversRegions(guide.areas, req.regions))
    .filter((c) => isFree(c, req.start, req.end, now))
    .map((c) => {
      const speaksLanguage = !req.language || (c.guide.languages as string[]).includes(req.language);
      const rating = c.reviewCount > 0 ? c.reviewRating : c.guide.rating;
      const calendarSet = c.windows.some((w) => !w.blocked && w.end > now);
      return {
        guide: c.guide,
        dayRateMinor: guideDayRate(c.guide),
        rating,
        reviewCount: c.reviewCount,
        calendarSet,
        speaksLanguage,
        score:
          (speaksLanguage ? 100 : 0) +
          (rating ?? 3.5) * 10 +
          Math.min(c.guide.experienceYears, 20) +
          (calendarSet ? 5 : 0) +
          Math.min(c.reviewCount, 30) / 3,
      };
    })
    .filter((m) => m.speaksLanguage)
    .sort((a, b) => b.score - a.score || a.dayRateMinor - b.dayRateMinor);
}
