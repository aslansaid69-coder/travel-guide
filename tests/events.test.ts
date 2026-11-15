import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeEvent,
  visibleEvents,
  parseEventFeed,
  fetchEventSources,
  type EventSource,
} from "../lib/event-core";
import seed from "../data/events.json";
const valid = normalizeEvent(seed[0])!;
const source: EventSource = {
  id: "test",
  name: "Authorised calendar",
  url: "https://calendar.example/events",
  format: "json",
  enabled: true,
  permissionConfirmed: true,
  permissionNote: "Test fixture, explicit owner permission",
};
test("30-day window uses Almaty date at UTC midnight boundary and keeps upcoming/ongoing events", () => {
  const events = [
    { ...valid, id: "expired", startDate: "2026-10-15" },
    { ...valid, id: "boundary", startDate: "2026-10-16" },
    { ...valid, id: "future", startDate: "2027-01-01" },
    { ...valid, id: "ongoing", startDate: "2026-09-01", endDate: "2026-11-20" },
  ];
  const result = visibleEvents(events, new Date("2026-11-14T20:00:00Z"));
  assert.deepEqual(
    result.map((e) => e.id),
    ["ongoing", "boundary", "future"],
  );
});
test("invalid dates, unsafe source URLs, and reversed dates are rejected", () => {
  for (const patch of [
    { startDate: "2026-02-30" },
    { startDate: "not-a-date" },
    { sourceUrl: "javascript:alert(1)" },
    { endDate: "2020-01-01" },
  ])
    assert.equal(normalizeEvent({ ...valid, ...patch }), null);
});
test("unlicensed remote images fall back to the licensed local image", () => {
  assert.equal(
    normalizeEvent({ ...valid, image: "https://other-site.example/poster.jpg" })
      ?.image,
    "/images/kok-tobe.jpg",
  );
});
test("RSS publication date never becomes an event date", () => {
  const rss =
    "<rss><channel><item><title>News</title><link>https://example.com/news</link><pubDate>2026-11-15</pubDate><description>News is not an event</description></item></channel></rss>";
  assert.deepEqual(parseEventFeed(rss, { ...source, format: "rss" }), []);
});
test("RSS with explicit event fields imports with attribution", () => {
  const rss =
    '<rss xmlns:event="urn:almaty:event"><channel><item><guid>one</guid><title>Test event</title><link>https://example.com/event</link><event:startDate>2026-12-01</event:startDate><event:location>Almaty</event:location><description>A permitted description</description></item></channel></rss>';
  const events = parseEventFeed(rss, { ...source, format: "rss" });
  assert.equal(events.length, 1);
  assert.equal(events[0].sourceName, source.name);
});
test("sources without permission are never fetched; failed feeds retain curated records", async () => {
  let calls = 0;
  const fakeFetch = (async () => {
    calls++;
    throw new Error("Offline");
  }) as typeof fetch;
  const result = await fetchEventSources(
    [{ ...source, permissionConfirmed: false }, source],
    seed,
    fakeFetch,
  );
  assert.equal(calls, 1);
  assert.equal(result.events.length, seed.length);
  assert.equal(result.warnings.length, 1);
});
test("authorised feed updates win; duplicates appear once", async () => {
  const updated = { ...valid, title: "Updated title" };
  const fakeFetch = (async () =>
    new Response(JSON.stringify([updated]), {
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
  const result = await fetchEventSources([source], seed, fakeFetch);
  const shown = visibleEvents(
    result.events,
    new Date("2026-11-15T12:00:00+05:00"),
  );
  assert.equal(shown.filter((e) => e.id === valid.id).length, 1);
  assert.equal(shown.find((e) => e.id === valid.id)?.title, "Updated title");
});
