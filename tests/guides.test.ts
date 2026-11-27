import test from "node:test";
import assert from "node:assert/strict";
import { coversRegions, guideDayRate, isFree, matchGuides, type MatchCandidate } from "../lib/guides/match";
import { guideSchema } from "../lib/platform/types";

const now = new Date("2026-12-01T00:00:00Z");
const d = (s: string) => new Date(s);
const guide = (over: Record<string, unknown> = {}) =>
  guideSchema.parse({
    id: "g-" + Math.random().toString(36).slice(2, 8),
    name: "Guide",
    email: "g@example.com",
    languages: ["en", "ru"],
    specialties: ["history"],
    areas: ["Almaty", "Almaty Region"],
    rateType: "day",
    rateMinor: 3000000,
    currency: "KZT",
    status: "active",
    ...over,
  });
const cand = (over: Partial<MatchCandidate> = {}): MatchCandidate => ({
  guide: guide(),
  windows: [],
  busy: [],
  reviewRating: null,
  reviewCount: 0,
  ...over,
});
const trip = { regions: ["Almaty"], language: "en", start: d("2026-12-10T03:00:00Z"), end: d("2026-12-11T15:00:00Z"), currency: "KZT" };

test("day rate: hourly guides assume 8 hours", () => {
  assert.equal(guideDayRate({ rateType: "day", rateMinor: 100 }), 100);
  assert.equal(guideDayRate({ rateType: "hour", rateMinor: 100 }), 800);
  assert.equal(guideDayRate({ rateType: "tour", rateMinor: 100 }), 100);
});

test("regions: every requested region must be covered", () => {
  assert.equal(coversRegions(["Almaty"], ["Almaty Region"]), true); // "Almaty Region" normalises to "almaty"
  assert.equal(coversRegions(["Almaty"], ["Almaty", "Turkestan"]), false);
  assert.equal(coversRegions(["Kazakhstan"], ["Turkestan"]), true);
});

test("availability: blocked windows and existing tours exclude; calendar windows must cover the trip", () => {
  assert.equal(isFree(cand(), trip.start, trip.end, now), true, "no calendar yet = open");
  assert.equal(
    isFree(cand({ windows: [{ start: d("2026-12-10T00:00:00Z"), end: d("2026-12-10T23:00:00Z"), blocked: true }] }), trip.start, trip.end, now),
    false,
  );
  assert.equal(isFree(cand({ busy: [{ start: d("2026-12-11T00:00:00Z"), end: d("2026-12-11T05:00:00Z") }] }), trip.start, trip.end, now), false);
  const covering = [
    { start: d("2026-12-09T00:00:00Z"), end: d("2026-12-10T20:00:00Z"), blocked: false },
    { start: d("2026-12-10T20:00:00Z"), end: d("2026-12-12T00:00:00Z"), blocked: false },
  ];
  assert.equal(isFree(cand({ windows: covering }), trip.start, trip.end, now), true);
  const gap = [covering[0], { ...covering[1], start: d("2026-12-11T08:00:00Z") }];
  assert.equal(isFree(cand({ windows: gap }), trip.start, trip.end, now), false);
});

test("matching filters by status, currency, region and language and ranks best first", () => {
  const strong = cand({ guide: guide({ name: "Strong", experienceYears: 12, rating: 4.9 }) });
  const weak = cand({ guide: guide({ name: "Weak", experienceYears: 1, rating: 3.9 }) });
  const paused = cand({ guide: guide({ name: "Paused", status: "paused" }) });
  const usd = cand({ guide: guide({ name: "USD", currency: "USD" }) });
  const ruOnly = cand({ guide: guide({ name: "RU", languages: ["ru"] }) });
  const elsewhere = cand({ guide: guide({ name: "Astana", areas: ["Astana"] }) });
  const result = matchGuides([weak, paused, usd, ruOnly, elsewhere, strong], trip, now);
  assert.deepEqual(result.map((m) => m.guide.name), ["Strong", "Weak"]);
  assert.equal(result[0].dayRateMinor, 3000000);
  const anyLanguage = matchGuides([ruOnly], { ...trip, language: undefined }, now);
  assert.equal(anyLanguage.length, 1);
});

test("reviews override the owner's starting rating once they exist", () => {
  const c = cand({ guide: guide({ rating: 3 }), reviewRating: 4.8, reviewCount: 5 });
  assert.equal(matchGuides([c], trip, now)[0].rating, 4.8);
  assert.equal(matchGuides([cand({ guide: guide({ rating: 3 }) })], trip, now)[0].rating, 3);
});
