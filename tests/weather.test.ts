import test from "node:test";
import assert from "node:assert/strict";
import { parseWeather } from "../lib/weather/provider";
import { weatherAdvice, localDay } from "../lib/weather/advice";
import { weatherFixture, now } from "./fixtures/weather";
test("forecast parses all seven local days, with numeric conditions and sunrise/sunset", () => {
  const w = parseWeather(weatherFixture(), now);
  assert.equal(w.daily.length, 7);
  assert.equal(w.hourly.length, 168);
  assert.equal(w.daily[0].date, "2026-11-16");
  assert.equal(w.current.temperature, 15);
  assert.equal(
    localDay(Date.parse("2026-11-15T20:00:00Z") / 1000),
    "2026-11-16",
  );
});
test("missing, null, stale or wrong-date data is rejected rather than presented as zero", () => {
  for (const mutate of [
    (f: ReturnType<typeof weatherFixture>) => {
      f.current.time -= 10000;
    },
    (f: ReturnType<typeof weatherFixture>) => {
      f.daily.time.shift();
    },
    (f: ReturnType<typeof weatherFixture>) => {
      f.hourly.relative_humidity_2m[0] = null as unknown as number;
    },
    (f: ReturnType<typeof weatherFixture>) => {
      f.daily.time = f.daily.time.map((t) => t - 86400);
    },
  ]) {
    const f = weatherFixture();
    mutate(f);
    assert.throws(() => parseWeather(f, now));
  }
});
test("cold, damp, snowy and windy weather gives layers, footwear and rain-gear guidance", () => {
  const w = parseWeather(weatherFixture(), now);
  w.current.humidity = 90;
  w.daily[0] = { ...w.daily[0], min: -5, rainChance: 80, wind: 30 };
  w.hourly = w.hourly.map((h) => ({
    ...h,
    temperature: -2,
    feelsLike: -6,
    code: 73,
    rainChance: 80,
    wind: 30,
  }));
  const a = weatherAdvice(w, now);
  assert.ok(a.clothing.some((t) => t.includes("thermal")));
  assert.ok(a.clothing.some((t) => t.includes("grippy")));
  assert.ok(a.clothing.some((t) => t.includes("waterproof")));
  assert.ok(a.clothing.some((t) => t.includes("Damp")));
  assert.ok(a.clothing.some((t) => t.includes("windproof")));
});
test("sun protection and hydration use UV, humidity and heat inputs", () => {
  const w = parseWeather(weatherFixture(), now);
  w.current.humidity = 20;
  w.daily[0].uv = 9;
  w.daily[0].max = 36;
  const a = weatherAdvice(w, now);
  assert.ok(a.clothing.some((t) => t.includes("sun protection")));
  assert.ok(a.clothing.some((t) => t.includes("drinking water")));
  assert.ok(a.cautions.some((t) => t.includes("Very hot")));
  assert.ok(a.cautions.some((t) => t.includes("Very high UV")));
});
test("outdoor suggestion uses a future, contiguous daylight window and excludes dangerous conditions", () => {
  const w = parseWeather(weatherFixture(), now),
    a = weatherAdvice(w, now);
  assert.ok(a.outdoorWindow);
  assert.ok(a.outdoorWindow.start >= now.valueOf() / 1000);
  assert.equal(a.outdoorWindow.end - a.outdoorWindow.start, 7200);
  w.hourly = w.hourly.map((h) => ({ ...h, code: 95, gust: 90 }));
  const storm = weatherAdvice(w, now);
  assert.equal(storm.outdoorWindow, null);
  assert.ok(storm.cautions.some((t) => t.includes("Thunderstorms")));
});
test("expired forecast cannot produce today clothing or a misleading outdoor recommendation", () => {
  const a = weatherAdvice(
    parseWeather(weatherFixture(), now),
    new Date("2026-11-25T10:00:00+05:00"),
  );
  assert.equal(a.clothing.length, 0);
  assert.equal(a.outdoorWindow, null);
});
