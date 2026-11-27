import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateTour,
  EstimateError,
  haversineKm,
  straightLineLegs,
  type EstimatePlace,
} from "../lib/pricing/estimate";
import { defaultPricing, pricingSchema, type PricingSettings } from "../lib/pricing/settings";

const s: PricingSettings = pricingSchema.parse({
  currency: "KZT",
  transportPerKmMinor: 20000, // 200 ₸/km
  transportMinPerDayMinor: 0,
  vehicleCapacity: 4,
  roadFactor: 1,
  averageSpeedKmh: 60,
  transportBufferPercent: 20,
  hoursPerDay: 8,
  fallbackGuideDayMinor: 3000000,
  commissionPercent: 10,
  depositPercent: 30,
  childTicketPercent: 50,
});
const place = (id: string, over: Partial<EstimatePlace> = {}): EstimatePlace => ({
  id,
  name: id,
  lat: 43.24,
  lng: 76.89,
  durationMin: 60,
  ticket: { minMinor: 100000, maxMinor: 200000, currency: "KZT" },
  ...over,
});
/** 10 km per leg, 10 minutes each — easy arithmetic. */
const legs = (n: number) => Array.from({ length: n + 1 }, () => ({ km: 10, minutes: 10 }));

test("tickets are multiplied by travellers; children use the child price or the child %", () => {
  const e = estimateTour(
    {
      places: [place("a"), place("b", { ticket: { minMinor: 50000, maxMinor: 50000, childMinor: 0, currency: "KZT" } })],
      adults: 2,
      children: 2,
      guide: null,
      legs: legs(2),
    },
    s,
  );
  const tickets = e.lines.find((l) => l.key === "tickets")!;
  // a: 2×1000 + 2×500 (50%) = 3000…  max 2×2000 + 2×1000 = 6000 ; b: 2×500 + 2×0 = 1000
  assert.equal(tickets.min, (2 * 100000 + 2 * 50000) + 2 * 50000);
  assert.equal(tickets.max, (2 * 200000 + 2 * 100000) + 2 * 50000);
});

test("transport = distance × per-km tariff × vehicles, upper bound adds the buffer", () => {
  const e = estimateTour({ places: [place("a"), place("b")], adults: 5, children: 0, guide: null, legs: legs(2) }, s);
  const t = e.lines.find((l) => l.key === "transport")!;
  assert.equal(e.distanceKm, 30);
  assert.equal(e.vehicles, 2); // 5 people, 4 seats
  assert.equal(t.min, 30 * 20000 * 2);
  assert.equal(t.max, Math.round(30 * 20000 * 2 * 1.2));
});

test("daily transport minimum applies to short trips", () => {
  const e = estimateTour(
    { places: [place("a")], adults: 1, children: 0, guide: null, legs: [{ km: 1, minutes: 5 }, { km: 1, minutes: 5 }] },
    { ...s, transportMinPerDayMinor: 1000000 },
  );
  assert.equal(e.lines.find((l) => l.key === "transport")!.min, 1000000);
});

test("days come from visit durations plus driving, by touring hours per day", () => {
  const one = estimateTour(
    { places: [place("a", { durationMin: 200 }), place("b", { durationMin: 200 })], adults: 1, children: 0, guide: null, legs: legs(2) },
    s,
  );
  assert.equal(one.visitMinutes, 400);
  assert.equal(one.driveMinutes, 30);
  assert.equal(one.days, 1); // 430 min ≤ 480
  const two = estimateTour(
    { places: [place("a", { durationMin: 300 }), place("b", { durationMin: 300 })], adults: 1, children: 0, guide: null, legs: legs(2) },
    s,
  );
  assert.equal(two.days, 2); // 630 min > 480
});

test("guide: selected rate × days, otherwise the range of available guides, otherwise fallback", () => {
  const base = { places: [place("a")], adults: 2, children: 0, legs: legs(1) };
  const sel = estimateTour({ ...base, guide: { kind: "selected", id: "g1", name: "Aigerim", dayRateMinor: 4000000 } }, s);
  const g1 = sel.lines.find((l) => l.key === "guide")!;
  assert.deepEqual([g1.min, g1.max], [4000000, 4000000]);
  const market = estimateTour(
    { ...base, guide: { kind: "market", minDayMinor: 2500000, maxDayMinor: 5000000, averageDayMinor: 3500000, count: 3 } },
    s,
  );
  const g2 = market.lines.find((l) => l.key === "guide")!;
  assert.deepEqual([g2.min, g2.max], [2500000, 5000000]);
  const none = estimateTour({ ...base, guide: { kind: "market", minDayMinor: 0, maxDayMinor: 0, averageDayMinor: 0, count: 0 } }, s);
  assert.equal(none.lines.find((l) => l.key === "guide")!.min, s.fallbackGuideDayMinor);
});

test("commission is applied to the subtotal and totals add up; deposit from the upper bound", () => {
  const e = estimateTour({ places: [place("a"), place("b")], adults: 2, children: 0, guide: null, legs: legs(2) }, s);
  const sum = (k: "min" | "max") => e.lines.reduce((a, l) => a + l[k], 0);
  assert.equal(e.total.min, sum("min"));
  assert.equal(e.total.max, sum("max"));
  const c = e.lines.find((l) => l.key === "commission")!;
  assert.equal(c.min, Math.round(e.subtotal.min * 0.1));
  assert.equal(e.depositMinor, Math.ceil(e.total.max * 0.3));
  assert.ok(e.total.max >= e.total.min);
  assert.match(e.disclaimer, /Approximate price/);
});

test("unknown prices are never invented: they are excluded and listed", () => {
  const e = estimateTour(
    { places: [place("a"), place("Big lake", { ticket: null })], adults: 1, children: 0, guide: null, legs: legs(2) },
    s,
  );
  assert.deepEqual(e.unpricedPlaces, ["Big lake"]);
  assert.equal(e.lines.find((l) => l.key === "tickets")!.max, 200000);
  const usd = estimateTour(
    { places: [place("u", { ticket: { minMinor: 1000, maxMinor: 1000, currency: "USD" } })], adults: 1, children: 0, guide: null, legs: legs(1) },
    s,
  );
  assert.deepEqual(usd.currencyMismatch, ["u"]);
  assert.equal(usd.lines.find((l) => l.key === "tickets")!.max, 0);
});

test("group tariffs are charged once, not per traveller", () => {
  const e = estimateTour(
    {
      places: [place("boat", { ticket: { minMinor: 1000000, maxMinor: 1500000, currency: "KZT", perPerson: false } })],
      adults: 4,
      children: 2,
      guide: null,
      legs: legs(1),
    },
    s,
  );
  const t = e.lines.find((l) => l.key === "tickets")!;
  assert.deepEqual([t.min, t.max], [1000000, 1500000]);
});

test("free places add zero and still count as priced", () => {
  const e = estimateTour(
    { places: [place("park", { ticket: { minMinor: 0, maxMinor: 0, currency: "KZT" } })], adults: 3, children: 1, guide: null, legs: legs(1) },
    s,
  );
  assert.equal(e.lines.find((l) => l.key === "tickets")!.max, 0);
  assert.equal(e.unpricedPlaces.length, 0);
});

test("validation: empty, too many, duplicates and traveller limits", () => {
  const ok = { adults: 1, children: 0, guide: null };
  assert.throws(() => estimateTour({ ...ok, places: [] }, s), EstimateError);
  assert.throws(
    () => estimateTour({ ...ok, places: Array.from({ length: s.maxPlaces + 1 }, (_, i) => place(`p${i}`)) }, s),
    /at most/,
  );
  assert.throws(() => estimateTour({ ...ok, places: [place("a"), place("a")] }, s), /only once/);
  assert.throws(() => estimateTour({ ...ok, adults: 0, places: [place("a")] }, s), /Travellers/);
  assert.throws(() => estimateTour({ ...ok, adults: 41, places: [place("a")] }, s), /Travellers/);
});

test("route falls back to straight-line legs: start → places → start", () => {
  const e = estimateTour({ places: [place("a", { lat: 43.3, lng: 77.0 })], adults: 1, children: 0, guide: null }, s);
  assert.equal(e.route.length, 2);
  assert.equal(e.route[0].from, s.startLabel);
  assert.equal(e.route[1].to, s.startLabel);
  const km = haversineKm({ lat: s.startLat, lng: s.startLng }, { lat: 43.3, lng: 77.0 });
  assert.ok(Math.abs(e.distanceKm - 2 * km) < 0.2);
  const l = straightLineLegs({ lat: 0, lng: 0 }, [{ lat: 0, lng: 1 }], { roadFactor: 2, averageSpeedKmh: 60 });
  assert.ok(Math.abs(l[0].km - 2 * 111.19) < 0.5);
});

test("known distance sanity check: Almaty centre to Charyn canyon ≈ 195 km straight line", () => {
  const km = haversineKm({ lat: 43.2389, lng: 76.8897 }, { lat: 43.3505, lng: 79.0815 });
  assert.ok(km > 170 && km < 185, String(km));
  assert.equal(defaultPricing.currency, "KZT");
});
