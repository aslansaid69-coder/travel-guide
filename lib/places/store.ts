import "server-only";
import { database } from "@/lib/db";
import { itemSchema, type CatalogItem } from "@/lib/hub/types";
import { HttpError } from "@/lib/hub/security";
import { likePattern, offset, PAGE_SIZE, type ListParams } from "@/lib/admin/list";
import { uniqueSlug } from "./slug";
import type { PlaceImport } from "./types";

export const PLACE_STATUS = { approved: "published", pending: "draft", hidden: "hidden" } as const;
export type PlaceStatusLabel = (typeof PLACE_STATUS)[keyof typeof PLACE_STATUS];
const STATUS_FROM_LABEL: Record<string, CatalogItem["status"]> = {
  published: "approved",
  draft: "pending",
  hidden: "hidden",
};

const parse = (row: Record<string, unknown>) =>
  itemSchema.parse({ ...(row.data as object), status: row.status });

export async function listPlaces(p: ListParams, category = "") {
  const sql = database();
  const status = STATUS_FROM_LABEL[p.status] ?? "";
  const like = likePattern(p.q);
  const where = sql`(${p.q} = '' OR data->>'name' ILIKE ${like} OR data->>'nameRu' ILIKE ${like} OR data->>'slug' ILIKE ${like} OR data->>'city' ILIKE ${like}) AND (${status} = '' OR status = ${status}) AND (${category} = '' OR data->>'category' = ${category})`;
  const [rows, count] = await Promise.all([
    sql`SELECT data,status,updated_at FROM hub_catalog WHERE ${where} ORDER BY updated_at DESC LIMIT ${PAGE_SIZE} OFFSET ${offset(p)}`,
    sql`SELECT count(*)::int AS n FROM hub_catalog WHERE ${where}`,
  ]);
  return {
    rows: rows.map((r) => ({ item: parse(r), updatedAt: String(r.updated_at) })),
    total: Number(count[0]?.n || 0),
  };
}

export async function getPlace(id: string) {
  const r = (await database()`SELECT data,status FROM hub_catalog WHERE id=${id}`)[0];
  return r ? parse(r) : null;
}

/** Public lookup: published places only, by slug or (legacy links) by id. */
export async function publishedPlace(slugOrId: string) {
  const r = (
    await database()`SELECT data,status FROM hub_catalog WHERE status='approved' AND (data->>'slug'=${slugOrId} OR id=${slugOrId}) LIMIT 1`
  )[0];
  return r ? parse(r) : null;
}

export async function slugTaken(slug: string, exceptId = "") {
  return (
    (await database()`SELECT 1 FROM hub_catalog WHERE data->>'slug'=${slug} AND id<>${exceptId} LIMIT 1`)
      .length > 0
  );
}

/** Existing catalog id for an external place, so the same place is never imported twice. */
export async function findImported(provider: PlaceImport["provider"], externalId: string) {
  const sql = database();
  const rows =
    provider === "google"
      ? await sql`SELECT id FROM hub_catalog WHERE data->>'googlePlaceId'=${externalId} LIMIT 1`
      : provider === "opentripmap"
        ? await sql`SELECT id FROM hub_catalog WHERE data->>'openTripMapId'=${externalId} LIMIT 1`
        : await sql`SELECT id FROM hub_catalog WHERE id=${`wiki-${externalId}`} OR data->'researchEvidence'->'descriptionSource'->>'url'=${`https://en.wikipedia.org/?curid=${externalId}`} LIMIT 1`;
  return rows[0] ? String(rows[0].id) : null;
}

export async function existingExternalIds(provider: PlaceImport["provider"], ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const sql = database();
  if (provider === "wikipedia") {
    const rows = await sql`SELECT id FROM hub_catalog WHERE id = ANY(${ids.map((i) => `wiki-${i}`)}::text[])`;
    return new Map(rows.map((r) => [String(r.id).slice(5), String(r.id)]));
  }
  const field = provider === "google" ? "googlePlaceId" : "openTripMapId";
  const rows = await sql`SELECT id, data->>${field} AS ext FROM hub_catalog WHERE data->>${field} = ANY(${ids}::text[])`;
  return new Map(rows.map((r) => [String(r.ext), String(r.id)]));
}

/** Builds a draft catalog item from an import, keeping only fields the provider allows us to store. */
export async function draftFromImport(imp: PlaceImport): Promise<CatalogItem> {
  const id = `${imp.provider === "wikipedia" ? "wiki" : imp.provider === "google" ? "g" : "otm"}-${imp.externalId}`
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .slice(0, 120);
  const slug = await uniqueSlug(imp.name, (s) => slugTaken(s, id));
  const now = new Date().toISOString();
  return itemSchema.parse({
    id,
    slug,
    name: imp.name || "New place",
    lat: imp.lat,
    lng: imp.lng,
    category: imp.category,
    city: imp.address === "Almaty Region" ? "" : "Almaty",
    region: imp.address === "Almaty Region" ? "Almaty Region" : "Almaty",
    address: imp.persisted.includes("address") ? imp.address : "",
    website: imp.persisted.includes("website") ? imp.website : "",
    photos: imp.persisted.includes("photos") ? imp.photos : [],
    image: imp.persisted.includes("photos") ? imp.photos[0]?.url || "" : "",
    alt: imp.persisted.includes("photos") ? imp.photos[0]?.alt || "" : "",
    imageCredit: imp.persisted.includes("photos") && imp.photos[0]
      ? {
          author: imp.photos[0].author,
          sourceUrl: imp.photos[0].sourceUrl,
          licence: imp.photos[0].licence,
          licenceUrl: imp.photos[0].licenceUrl,
        }
      : undefined,
    googlePlaceId: imp.provider === "google" ? imp.externalId : "",
    googleFetchedAt: imp.provider === "google" ? now : "",
    openTripMapId: imp.provider === "opentripmap" ? imp.externalId : "",
    source: imp.attribution,
    sourceUrl: imp.descriptionSourceUrl,
    status: "pending",
    verifiedAt: now,
    researchEvidence: {
      importedFrom: { provider: imp.provider, externalId: imp.externalId, at: now },
      ...(imp.provider === "wikipedia" ? { wikiPageId: imp.externalId } : {}),
      ...(imp.description && imp.persisted.includes("description")
        ? {
            descriptionSource: {
              text: imp.description,
              url: imp.descriptionSourceUrl,
              licence: imp.descriptionLicence,
            },
          }
        : {}),
    },
  });
}

export async function insertPlace(item: CatalogItem) {
  const sql = database();
  const rows =
    await sql`INSERT INTO hub_catalog(id,data,status,owner_edited) VALUES(${item.id},${JSON.stringify(item)}::jsonb,${item.status},true) ON CONFLICT(id) DO NOTHING RETURNING id`;
  if (!rows.length) throw new HttpError(409, "This place already exists in the catalog.");
}

export async function updatePlace(item: CatalogItem) {
  if (item.slug && (await slugTaken(item.slug, item.id)))
    throw new HttpError(409, `The URL slug “${item.slug}” is already used by another place.`);
  const rows =
    await database()`UPDATE hub_catalog SET data=${JSON.stringify(item)}::jsonb,status=${item.status},owner_edited=true,updated_at=now() WHERE id=${item.id} RETURNING id`;
  if (!rows.length) throw new HttpError(404, "Place not found.");
}

/**
 * Deletes a place that nothing references; otherwise hides it so existing bookings,
 * inventory and saved plans keep working. Returns what happened.
 */
export async function deletePlace(id: string): Promise<"deleted" | "hidden"> {
  const sql = database();
  try {
    const rows = await sql`DELETE FROM hub_catalog WHERE id=${id} RETURNING id`;
    if (!rows.length) throw new HttpError(404, "Place not found.");
    return "deleted";
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // 23503 = foreign_key_violation: referenced by slots, deals, waitlists or menus.
    if (String((error as { code?: string }).code) !== "23503") throw error;
    await sql`UPDATE hub_catalog SET status='hidden',updated_at=now() WHERE id=${id}`;
    return "hidden";
  }
}
