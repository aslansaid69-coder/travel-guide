/**
 * Integration tests against a real Postgres through the Neon HTTP shim.
 * Run: npm run test:local-db (needs NEON_HTTP_SHIM + DATABASE_URL, see CLAUDE.md).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { database } from "../../lib/db";
import {
  deletePlace,
  draftFromImport,
  existingExternalIds,
  findImported,
  getPlace,
  insertPlace,
  listPlaces,
  publishedPlace,
  updatePlace,
} from "../../lib/places/store";
import type { PlaceImport } from "../../lib/places/types";

const sql = database();
const imp: PlaceImport = {
  provider: "wikipedia",
  externalId: "999001",
  name: "Central State Museum of Kazakhstan",
  lat: 43.2365,
  lng: 76.9504,
  category: "museum",
  address: "Almaty",
  hours: "",
  website: "",
  phone: "",
  description: "The largest museum in Central Asia.",
  descriptionSourceUrl: "https://en.wikipedia.org/?curid=999001",
  descriptionLicence: "CC BY-SA 4.0",
  photos: [
    {
      url: "https://upload.wikimedia.org/x.jpg",
      alt: "Museum",
      author: "A. Author",
      sourceUrl: "https://commons.wikimedia.org/wiki/File:X.jpg",
      licence: "CC BY-SA 4.0",
      licenceUrl: "",
      provider: "wikimedia",
    },
  ],
  attribution: "Wikipedia",
  persisted: ["externalId", "name", "lat", "lng", "category", "description", "photos"],
  live: {},
};

test.before(async () => {
  await sql`DELETE FROM hub_slots WHERE item_id LIKE 'wiki-9990%'`;
  await sql`DELETE FROM hub_catalog WHERE id LIKE 'wiki-9990%' OR id LIKE 'g-%'`;
});

test("import draft keeps licensed fields, generates a unique slug and is not published", async () => {
  const draft = await draftFromImport(imp);
  assert.equal(draft.id, "wiki-999001");
  assert.equal(draft.slug, "central-state-museum-of-kazakhstan");
  assert.equal(draft.status, "pending");
  assert.equal(draft.photos.length, 1);
  assert.equal(draft.image, imp.photos[0].url);
  await insertPlace(draft);
  await assert.rejects(insertPlace(draft), /already exists/);
  assert.equal(await findImported("wikipedia", "999001"), "wiki-999001");
  assert.equal((await existingExternalIds("wikipedia", ["999001", "1"])).get("999001"), "wiki-999001");
  assert.equal(await publishedPlace(draft.slug), null, "drafts are not public");
  const second = await draftFromImport({ ...imp, externalId: "999002" });
  assert.equal(second.slug, "central-state-museum-of-kazakhstan-2");
});

test("Google imports never store address, hours or photos", async () => {
  const g = await draftFromImport({
    ...imp,
    provider: "google",
    externalId: "ChIJabcdefgh12345",
    address: "Should not persist",
    persisted: ["externalId", "name", "lat", "lng", "category"],
    description: "Google text must not persist",
  });
  assert.equal(g.address, "");
  assert.equal(g.photos.length, 0);
  assert.equal(g.image, "");
  assert.equal(g.googlePlaceId, "ChIJabcdefgh12345");
  assert.ok(g.googleFetchedAt);
  assert.equal(g.researchEvidence?.descriptionSource, undefined);
});

test("search, status filter, escaped wildcards", async () => {
  const all = await listPlaces({ q: "state museum", status: "", page: 1 });
  assert.ok(all.rows.some((r) => r.item.id === "wiki-999001"));
  const drafts = await listPlaces({ q: "", status: "draft", page: 1 });
  assert.ok(drafts.rows.every((r) => r.item.status === "pending"));
  const published = await listPlaces({ q: "", status: "published", page: 1 });
  assert.ok(published.total >= 7);
  const none = await listPlaces({ q: "%_%", status: "", page: 1 });
  assert.equal(none.total, 0, "LIKE wildcards in the query are escaped");
});

test("slug uniqueness is enforced on update and publishing works", async () => {
  const item = (await getPlace("wiki-999001"))!;
  await assert.rejects(updatePlace({ ...item, slug: "kok-tobe" }), /already used/);
  await updatePlace({ ...item, status: "approved" });
  assert.equal((await publishedPlace("central-state-museum-of-kazakhstan"))?.id, "wiki-999001");
});

test("referenced places are hidden, unreferenced places are deleted", async () => {
  await sql`INSERT INTO hub_slots(id,item_id,starts_at,ends_at,capacity) VALUES('slot-it-1','wiki-999001',now()+interval '1 day',now()+interval '1 day 2 hours',5)`;
  assert.equal(await deletePlace("wiki-999001"), "hidden");
  assert.equal((await getPlace("wiki-999001"))?.status, "hidden");
  await sql`DELETE FROM hub_slots WHERE id='slot-it-1'`;
  assert.equal(await deletePlace("wiki-999001"), "deleted");
  assert.equal(await getPlace("wiki-999001"), null);
  await assert.rejects(deletePlace("wiki-999001"), /not found/i);
});
