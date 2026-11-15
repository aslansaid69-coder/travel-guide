import { XMLParser } from "fast-xml-parser";
import { database } from "@/lib/db";
import { boundedBody } from "@/lib/updates/body";
import { itemSchema, type CatalogItem, type Rates } from "./types";
import { settings } from "./store";
async function overpass(query: string) {
  const endpoints = process.env.OVERPASS_ENDPOINT
    ? [process.env.OVERPASS_ENDPOINT]
    : [
        "https://overpass.private.coffee/api/interpreter",
        "https://overpass-api.de/api/interpreter",
      ];
  for (const endpoint of endpoints) {
    try {
      const url = new URL(endpoint);
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("Invalid source");
      url.searchParams.set("data", query);
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent":
            "AlmatyTravelGuide/1.0 (+https://almaty-travel-guide.vercel.app)",
        },
        signal: AbortSignal.timeout(13000),
        cache: "no-store",
        redirect: "error",
      });
      if (!response.ok) continue;
      const parsed = JSON.parse(await boundedBody(response, 1800000));
      if (Array.isArray(parsed.elements)) return parsed;
    } catch {
      /* Try one independent public instance; keep last-good data if both fail. */
    }
  }
  throw new Error("Source OSM discovery is temporarily unavailable.");
}
export async function discoverOSM() {
  const conf = await settings();
  if (!conf.discoveryEnabled) return { items: [], disabled: true };
  const query =
    '[out:json][timeout:10];(nwr(around:4500,43.2389,76.8897)[tourism~"attraction|museum|viewpoint"][name];nwr(around:4500,43.2389,76.8897)[amenity~"restaurant|cafe"][name];nwr(around:4500,43.2389,76.8897)[shop~"mall|craft|souvenir"][name];);out center tags 80;';
  const parsed = await overpass(query);
  if (!Array.isArray(parsed.elements) || !parsed.elements.length)
    throw new Error(
      "Source OSM returned no places; existing catalog retained.",
    );
  const items: CatalogItem[] = [];
  for (const e of parsed.elements) {
    const t = e.tags || {},
      lat = e.lat ?? e.center?.lat,
      lng = e.lon ?? e.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const category =
      t.amenity === "restaurant"
        ? "restaurant"
        : t.amenity === "cafe"
          ? "cafe"
          : t.tourism === "museum"
            ? "museum"
            : t.tourism === "viewpoint"
              ? "viewpoint"
              : t.shop
                ? "shop"
                : "activity";
    const id = `osm-${e.type}-${e.id}`,
      url = `https://www.openstreetmap.org/${e.type}/${e.id}`;
    items.push(
      itemSchema.parse({
        id,
        name: t["name:en"] || t.name,
        nameRu: t["name:ru"] || t.name,
        description: `${category === "restaurant" ? "A restaurant" : category === "cafe" ? "A café" : "A local " + category} in Almaty. Discovered from OpenStreetMap; details need owner review.`,
        category,
        lat,
        lng,
        outdoor: !["restaurant", "cafe", "museum", "shop"].includes(category),
        hours: t.opening_hours || "",
        phone: t.phone || t["contact:phone"] || "",
        website: t.website || t["contact:website"] || "",
        source: "© OpenStreetMap contributors · ODbL",
        sourceUrl: url,
        osmId: `${e.type}/${e.id}`,
        closed: !!(t.disused || t.abandoned || t["disused:amenity"]),
        status: "pending",
        verifiedAt: new Date().toISOString(),
      }),
    );
  }
  const sql = database();
  await sql.transaction(
    items.map(
      (i) =>
        sql`INSERT INTO hub_catalog(id,data,status) VALUES(${i.id},${JSON.stringify(i)}::jsonb,'pending') ON CONFLICT(id) DO UPDATE SET data=CASE WHEN hub_catalog.status='pending' THEN EXCLUDED.data ELSE hub_catalog.data END,updated_at=CASE WHEN hub_catalog.status='pending' THEN now() ELSE hub_catalog.updated_at END`,
    ),
  );
  return { count: items.length, items };
}
export async function discoverGoogle() {
  if (!process.env.GOOGLE_PLACES_API_KEY)
    return { configured: false, count: 0 };
  const r = await fetch(
    "https://places.googleapis.com/v1/places:searchNearby",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask": "places.id",
      },
      body: JSON.stringify({
        includedTypes: [
          "tourist_attraction",
          "museum",
          "restaurant",
          "cafe",
          "shopping_mall",
          "park",
        ],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: 43.2389, longitude: 76.8897 },
            radius: 6000,
          },
        },
      }),
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    },
  );
  if (!r.ok) throw new Error("Source Google discovery failed.");
  const d = JSON.parse(await boundedBody(r, 100000));
  const ids = (d.places || [])
    .map((p: { id: string }) => p.id)
    .filter((id: unknown) => typeof id === "string" && id.length < 220);
  const sql = database();
  for (const id of ids)
    await sql`INSERT INTO content_candidates(source_key,external_id,kind,data) VALUES('google.place-ids',${id},'places',${JSON.stringify({ id, googlePlaceId: id, requiresOwnerContent: true })}::jsonb) ON CONFLICT DO NOTHING`;
  return { configured: true, count: ids.length };
}
// Google permits persistent Place IDs. Other Google details are fetched live, never copied into the OSM catalog/cache.
export async function googleDetails(id: string) {
  if (!process.env.GOOGLE_PLACES_API_KEY)
    throw new Error("Google Places is not configured.");
  const r = await fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`,
    {
      headers: {
        "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask":
          "id,displayName,rating,userRatingCount,businessStatus,regularOpeningHours,googleMapsUri,attributions",
      },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    },
  );
  if (!r.ok) throw new Error("Google details unavailable.");
  return JSON.parse(await boundedBody(r, 150000));
}
export async function exchangeRates(): Promise<Rates> {
  const r = await fetch("https://nationalbank.kz/rss/rates_all.xml", {
    signal: AbortSignal.timeout(10000),
    cache: "no-store",
  });
  if (!r.ok) throw new Error("Source exchange rates unavailable.");
  const d = new XMLParser().parse(await boundedBody(r, 150000));
  const entries = d.rss?.channel?.item;
  if (!Array.isArray(entries))
    throw new Error("Source exchange response invalid.");
  const rates: Record<string, number> = { KZT: 1 };
  for (const e of entries) {
    const units = Number(e.quant || 1),
      value = Number(String(e.description).replace(",", "."));
    if (
      ["USD", "EUR", "GBP", "RUB"].includes(e.title) &&
      value > 0 &&
      units > 0
    )
      rates[e.title] = units / value;
  }
  if (Object.keys(rates).length < 4)
    throw new Error("Source exchange rates incomplete.");
  return {
    date: String(
      entries[0]?.pubDate ||
        d.rss?.channel?.pubDate ||
        new Date().toISOString().slice(0, 10),
    ),
    source: "National Bank of Kazakhstan",
    rates,
  };
}
export async function closureScan() {
  const sql = database();
  const rows =
    await sql`SELECT id,data FROM hub_catalog WHERE status='approved' AND data->>'osmId'<>'' LIMIT 100`;
  if (!rows.length) return { checked: 0, flagged: 0 };
  const ids = rows
    .map((r) => String(r.data.osmId))
    .filter((v) => /^(node|way|relation)\/\d+$/.test(v));
  if (!ids.length) return { checked: 0, flagged: 0 };
  const query = `[out:json][timeout:10];(${ids.map((id) => id.replace("/", "(") + ");").join("")});out tags;`;
  const d = await overpass(query);
  const flagged = d.elements.filter(
    (e: { tags: Record<string, string> }) =>
      e.tags &&
      (e.tags.disused || e.tags.abandoned || e.tags["disused:amenity"]),
  );
  const conf = await settings();
  for (const e of flagged) {
    const id = `osm-${e.type}-${e.id}`;
    await sql`UPDATE hub_catalog SET data=jsonb_set(data,'{closed}','true'::jsonb),status=CASE WHEN ${conf.hideClosed} THEN 'hidden' ELSE status END,updated_at=now() WHERE id=${id}`;
  }
  return { checked: ids.length, flagged: flagged.length };
}
