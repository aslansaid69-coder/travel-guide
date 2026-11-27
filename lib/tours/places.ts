import "server-only";
import { database } from "@/lib/db";
import { itemSchema, type CatalogItem } from "@/lib/hub/types";

/** Places of an existing booking, in order, even if they were unpublished later. */
export async function loadTourPlacesLoose(ids: string[]): Promise<CatalogItem[]> {
  if (!ids.length) return [];
  const rows = await database()`SELECT data,status FROM hub_catalog WHERE id = ANY(${ids}::text[])`;
  const byId = new Map(rows.map((r) => [String((r.data as { id: string }).id), itemSchema.parse({ ...(r.data as object), status: r.status })]));
  return ids.map((id) => byId.get(id)).filter((i): i is CatalogItem => !!i);
}
