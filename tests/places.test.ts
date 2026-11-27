import test from "node:test";
import assert from "node:assert/strict";
import { slugify, uniqueSlug } from "../lib/places/slug";
import { guessCategory } from "../lib/places/http";
import { parsePhotos, photosToText } from "../lib/places/photos";
import { priceSchema } from "../lib/hub/types";
import prices from "../data/place-prices.json";

test("slugify handles Latin, Russian and Kazakh names", () => {
  assert.equal(slugify("Kok-Tobe Hill"), "kok-tobe-hill");
  assert.equal(slugify("Медеу"), "medeu");
  assert.equal(slugify("Шымбұлақ"), "shymbulaq");
  assert.equal(slugify("Зелёный базар"), "zelenyi-bazar");
  assert.equal(slugify("  ---  "), "place");
  assert.equal(slugify("Café Déjà Vu!"), "cafe-deja-vu");
  assert.ok(slugify("a".repeat(200)).length <= 80);
});

test("uniqueSlug appends a counter until free", async () => {
  const taken = new Set(["medeu", "medeu-2"]);
  assert.equal(await uniqueSlug("Medeu", async (s) => taken.has(s)), "medeu-3");
  assert.equal(await uniqueSlug("New", async () => false), "new");
});

test("category guessing maps provider types", () => {
  assert.equal(guessCategory("museum", "tourist_attraction"), "museum");
  assert.equal(guessCategory("Big Almaty Lake"), "mountains");
  assert.equal(guessCategory("Green Bazaar"), "market");
  assert.equal(guessCategory("something odd"), "activity");
});

test("photo lines round-trip and reject non-https URLs", () => {
  const text = "https://upload.wikimedia.org/a.jpg | Lake | Jane | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:A.jpg\nhttp://insecure.example/b.jpg | x\njavascript:alert(1)";
  const photos = parsePhotos(text);
  assert.equal(photos.length, 1);
  assert.equal(photos[0].provider, "wikimedia");
  assert.equal(photos[0].author, "Jane");
  assert.equal(parsePhotos(photosToText(photos))[0].url, photos[0].url);
});

test("every researched price is sourced, dated and valid; estimates are labelled", () => {
  assert.equal(prices.length, 7);
  for (const r of prices) {
    const p = priceSchema.parse(r.price);
    assert.match(p.sourceUrl, /^https:\/\//, r.id);
    assert.match(p.checkedAt, /^\d{4}-\d{2}-\d{2}$/, r.id);
    assert.ok(p.max >= p.min, r.id);
    if (p.type === "free") assert.equal(p.max, 0, r.id);
  }
  const estimated = prices.filter((r) => r.price.source === "estimated").map((r) => r.id).sort();
  assert.deepEqual(estimated, ["big-almaty-lake", "charyn"]);
});
