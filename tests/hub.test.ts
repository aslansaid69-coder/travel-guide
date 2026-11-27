import test from "node:test";
import assert from "node:assert/strict";
import {
  itemSchema,
  planSchema,
  priceSchema,
  defaultSettings,
  type CatalogItem,
  type Plan,
} from "../lib/hub/types";
import {
  estimate,
  generatePlan,
  conflicts,
  isOpen,
  km,
  dayDate,
} from "../lib/hub/core";
import { parseMenuText } from "../lib/hub/menu";
import { statements } from "../lib/hub/migrate";
import { hash, matches, safeUrl } from "../lib/hub/security";
import { partnerCan } from "../lib/hub/access";
const item = (v: Partial<CatalogItem> = {}) =>
  itemSchema.parse({
    id: "park",
    name: "Park",
    category: "park",
    lat: 43.2389,
    lng: 76.8897,
    status: "approved",
    ...v,
  });
const plan = (v: Partial<Plan> = {}) =>
  planSchema.parse({
    title: "Trip",
    startDate: "2026-12-01",
    adults: 2,
    children: 1,
    days: [
      { stops: [{ id: "s1", itemId: "park", start: "10:00", duration: 60 }] },
    ],
    ...v,
  });
test("pricing uses integer minor units, adult/child prices, markup, season and group discount once", () => {
  const p = plan(),
    i = item({
      price: {
        type: "per-person",
        min: 100000,
        max: 200000,
        child: 50000,
        currency: "KZT",
        source: "owner-confirmed",
        updatedAt: "2026-11-16",
        note: "",
        sourceUrl: "",
        checkedAt: "",
      },
    });
  const e = estimate(
    p,
    [i],
    {
      ...defaultSettings,
      markup: 10,
      groupThreshold: 3,
      groupDiscount: 20,
      seasonal: [{ from: "2026-12-01", to: "2026-12-31", percent: 25 }],
    },
    null,
  );
  assert.equal(e.min, 275000);
  assert.equal(e.max, 495000);
  assert.equal(e.unknown, 0);
  assert.equal(e.lines[0].confirmed, true);
});
test("unknown and unavailable exchange prices remain unpriced instead of free", () => {
  const i = item({
    price: {
      type: "fixed",
      min: 1000,
      max: 1000,
      currency: "USD",
      source: "estimated",
      updatedAt: "2026-11-16",
      note: "",
      sourceUrl: "",
      checkedAt: "",
    },
  });
  const e = estimate(plan(), [i], defaultSettings, null);
  assert.equal(e.unknown, 1);
  assert.equal(e.lines[0].unknown, true);
  assert.equal(estimate(plan(), [item()], defaultSettings, null).unknown, 1);
});
test("currency conversion is indicative and does not change base settlement numbers", () => {
  const i = item({
    price: {
      type: "fixed",
      min: 50000,
      max: 50000,
      currency: "USD",
      source: "owner-confirmed",
      updatedAt: "2026-11-16",
      note: "",
      sourceUrl: "",
      checkedAt: "",
    },
  });
  const e = estimate(plan({ currency: "EUR" }), [i], defaultSettings, {
    date: "2026-11-16",
    source: "Test",
    rates: { KZT: 1, USD: 0.002, EUR: 0.0018 },
  });
  assert.equal(e.min, 25000000);
  assert.equal(e.displayRate, 0.0018);
  assert.equal(e.currency, "EUR");
});
test("menu spend is estimated even when menu prices were entered by an owner", () => {
  const i = item({
    category: "restaurant",
    menu: [
      {
        id: "m",
        name: "Soup",
        description: "",
        price: 150000,
        tags: [],
        photo: "",
      },
    ],
    menuUpdatedAt: "2026-11-16",
  });
  const e = estimate(plan(), [i], defaultSettings, null);
  assert.equal(e.min, 450000);
  assert.equal(e.max, 900000);
  assert.equal(e.lines[0].confirmed, false);
});
test("free price cannot hide a nonzero fee and invalid calendar dates are rejected", () => {
  assert.equal(
    priceSchema.safeParse({
      type: "free",
      min: 500,
      max: 500,
      currency: "KZT",
      source: "owner-confirmed",
      updatedAt: "today",
    }).success,
    false,
  );
  assert.equal(
    planSchema.safeParse({ ...plan(), startDate: "2026-02-31" }).success,
    false,
  );
});
test("opening windows validate a full visit and explicit closed days differ from unknown", () => {
  const i = item({ schedule: { "2": [["10:00", "16:00"]], "3": [] } });
  assert.equal(isOpen(i, "2026-12-01", "15:30", 60), false);
  assert.equal(isOpen(i, "2026-12-01", "10:00", 60), true);
  assert.equal(isOpen(i, "2026-12-02", "10:00"), false);
  assert.equal(isOpen(i, "2026-12-03", "10:00"), null);
});
test("auto planner skips unsafe outdoor choices and closed places", () => {
  const items = [
    item({ id: "out", outdoor: true }),
    item({ id: "closed", outdoor: false, schedule: { "2": [] } }),
    item({ id: "indoor", outdoor: false, category: "museum" }),
  ];
  const result = generatePlan(plan({ days: [{ stops: [] }] }), items, {
    daily: [{ date: "2026-12-01", rainChance: 95, code: 95, min: 10, max: 14 }],
  });
  assert.deepEqual(
    result.days[0].stops.map((s) => s.itemId),
    ["indoor"],
  );
});
test("conflict checker reports closed visits, travel overlap and unsafe outdoor weather", () => {
  const p = plan({
    days: [
      {
        stops: [
          { id: "one", itemId: "park", start: "10:00", duration: 90, note: "" },
          { id: "two", itemId: "far", start: "10:30", duration: 60, note: "" },
        ],
      },
    ],
  });
  const result = conflicts(
    p,
    [
      item({ schedule: { "2": [] } }),
      item({ id: "far", lat: 43.6, outdoor: true }),
    ],
    {
      daily: [
        { date: "2026-12-01", rainChance: 90, code: 95, min: 8, max: 14 },
      ],
    },
  );
  for (const kind of ["hours", "travel", "weather"])
    assert(result.some((r) => r.kind === kind));
});
test("coordinates and date calculations remain stable across a month boundary", () => {
  assert(km({ lat: 43, lng: 76 }, { lat: 43, lng: 76 }) < 0.00001);
  assert.equal(dayDate("2026-12-31", 1), "2027-01-01");
});
test("menu parser preserves explicit prices and accepts only declared dietary tags", () => {
  const result = parseMenuText(
    "Soup; 1500; Vegetable soup; vegan,magic\nNo price\nTea; 700; Black tea;\n",
  );
  assert.equal(result.length, 2);
  assert.equal(result[0].price, 150000);
  assert.deepEqual(result[0].tags, ["vegan"]);
});
test("partners cannot access another restaurant and URLs reject executable schemes", () => {
  const staff = {
    id: "p",
    email: "p@example.com",
    role: "partner" as const,
    restaurantIds: ["a"],
    languages: ["en"],
  };
  assert.equal(partnerCan(staff, "a"), true);
  assert.equal(partnerCan(staff, "b"), false);
  assert.equal(safeUrl("javascript:alert(1)"), "");
  assert.equal(safeUrl("https://user:pass@example.com"), "");
  assert.equal(safeUrl("/images/../secrets"), "");
});
test("private edit capabilities are hashed and migrations preserve function bodies", () => {
  const key = "some-high-entropy-test-key";
  assert(matches(key, hash(key)));
  assert(!matches(key + "x", hash(key)));
  const sql =
    "CREATE FUNCTION f() RETURNS void AS $fn$ BEGIN PERFORM 'a;b'; END; $fn$ LANGUAGE plpgsql; SELECT 'x;z';";
  assert.equal(statements(sql).length, 2);
});
