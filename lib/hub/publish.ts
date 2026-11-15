import { database } from "@/lib/db";
import { itemSchema, type CatalogItem } from "./types";
import { settings, saveCatalog } from "./store";
import { safeUrl } from "./security";
export async function autoPublish(records: unknown[], sourceKey: string) {
  if (!(await settings()).autoPublish) return 0;
  let count = 0;
  for (const raw of records) {
    const parsed = itemSchema.safeParse(raw);
    if (!parsed.success) continue;
    const item = parsed.data;
    if (
      item.rating === null ||
      item.rating < 4.3 ||
      item.reviews < 50 ||
      /google/i.test(item.source) ||
      !safeUrl(item.sourceUrl)
    )
      continue;
    const existing = (
      await database()`SELECT status,owner_edited FROM hub_catalog WHERE id=${item.id}`
    )[0];
    // Optional discovery automation must never unhide a place or overwrite an owner-approved version.
    if (existing && (existing.status !== "pending" || existing.owner_edited))
      continue;
    const next: CatalogItem = {
      ...item,
      status: "approved",
      price: item.price ? { ...item.price, source: "estimated" } : null,
      image: safeUrl(item.image),
      website: safeUrl(item.website),
      sourceUrl: safeUrl(item.sourceUrl),
    };
    await saveCatalog(next, {
      id: "auto-publish",
      email: "",
      role: "owner",
      restaurantIds: [],
      languages: [],
    });
    await database()`UPDATE content_candidates SET status='approved' WHERE source_key=${sourceKey} AND external_id=${item.id}`;
    count++;
  }
  return count;
}
