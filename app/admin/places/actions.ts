"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { currencySchema, itemSchema, slugSchema, type CatalogItem } from "@/lib/hub/types";
import { HttpError } from "@/lib/hub/security";
import { back, failure, isRedirect, parseForm } from "@/lib/admin/form";
import { provider } from "@/lib/places/providers";
import {
  deletePlace,
  draftFromImport,
  existingExternalIds,
  findImported,
  getPlace,
  insertPlace,
  updatePlace,
} from "@/lib/places/store";
import { draftDescription, type GeneratedDescription } from "@/lib/ai/describe";
import { googleDetails } from "@/lib/places/providers/google";
import type { PlaceSearchResult } from "@/lib/places/types";
import { parsePhotos } from "@/lib/places/photos";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
const fail = (error: unknown): { ok: false; error: string } => ({ ok: false, error: failure(error) });

const searchInput = z.object({
  query: z.string().trim().min(2, "Type at least 2 characters").max(120),
  provider: z.enum(["google", "opentripmap", "wikipedia"]),
});

export async function searchPlaces(input: z.input<typeof searchInput>): Promise<ActionResult<PlaceSearchResult[]>> {
  try {
    await authorize("places.import");
    const q = searchInput.parse(input);
    const results = await provider(q.provider).search(q.query);
    const existing = await existingExternalIds(q.provider, results.map((r) => r.externalId));
    return { ok: true, data: results.map((r) => ({ ...r, existingId: existing.get(r.externalId) })) };
  } catch (error) {
    return fail(error);
  }
}

const importInput = z.object({
  provider: z.enum(["google", "opentripmap", "wikipedia"]),
  externalId: z.string().trim().min(1).max(300),
});

export async function importPlace(input: z.input<typeof importInput>): Promise<ActionResult<{ id: string }>> {
  let id: string;
  try {
    const actor = await authorize("places.import");
    const q = importInput.parse(input);
    const existing = await findImported(q.provider, q.externalId);
    if (existing) return { ok: true, data: { id: existing } };
    const imp = await provider(q.provider).details(q.externalId);
    const item = await draftFromImport(imp);
    await insertPlace(item);
    await recordAudit(actor, "place.import", item.id, { provider: q.provider, externalId: q.externalId, name: item.name });
    id = item.id;
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/admin/places");
  return { ok: true, data: { id } };
}

export async function generateDescription(
  placeId: string,
  notes: string,
): Promise<ActionResult<GeneratedDescription>> {
  try {
    const actor = await authorize("places.ai");
    const item = await getPlace(z.string().max(120).parse(placeId));
    if (!item) throw new HttpError(404, "Place not found.");
    const draft = await draftDescription(item, z.string().max(1500).parse(notes));
    await recordAudit(actor, "place.ai.describe", item.id, { model: "claude" });
    return { ok: true, data: draft };
  } catch (error) {
    return fail(error);
  }
}

const tenge = z.coerce.number().min(0).max(10_000_000);
const optionalTenge = z.union([z.literal(""), tenge]).transform((v) => (v === "" ? undefined : v));
const placeForm = z.object({
  id: z.string().max(120),
  name: z.string().trim().min(1, "Name is required").max(180),
  nameRu: z.string().trim().max(180).default(""),
  nameKk: z.string().trim().max(180).default(""),
  slug: slugSchema,
  category: itemSchema.shape.category,
  region: z.string().trim().max(120).default(""),
  city: z.string().trim().max(120).default(""),
  address: z.string().trim().max(500).default(""),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  description: z.string().trim().max(1800).default(""),
  descriptionRu: z.string().trim().max(1800).default(""),
  descriptionKk: z.string().trim().max(1800).default(""),
  hours: z.string().trim().max(400).default(""),
  duration: z.coerce.number().int().min(15).max(1440),
  season: z.string().trim().max(250).default(""),
  transport: z.string().trim().max(1000).default(""),
  website: z.union([z.literal(""), z.url().max(800)]).default(""),
  phone: z.string().trim().max(100).default(""),
  outdoor: z.literal("on").optional(),
  bookable: z.literal("on").optional(),
  status: z.enum(["approved", "pending", "hidden"]),
  photos: z.string().max(12000).default(""),
  priceStatus: z.enum(["unknown", "found", "not_found"]),
  priceType: z.enum(["free", "fixed", "per-person", "per-group", "range"]),
  priceMin: optionalTenge,
  priceMax: optionalTenge,
  priceChild: optionalTenge,
  priceCurrency: currencySchema,
  priceSourceUrl: z.union([z.literal(""), z.url().max(800)]).default(""),
  priceCheckedAt: z.union([z.literal(""), z.iso.date()]).default(""),
  priceNote: z.string().trim().max(300).default(""),
  priceSource: z.enum(["owner-confirmed", "auto-detected", "estimated"]),
});

export async function savePlace(formData: FormData) {
  const id = String(formData.get("id") || "");
  const path = `/admin/places/${encodeURIComponent(id)}`;
  try {
    const actor = await authorize("places.write");
    const f = parseForm(placeForm, formData);
    const current = await getPlace(f.id);
    if (!current) throw new HttpError(404, "Place not found.");
    const photos = parsePhotos(f.photos);
    let price: CatalogItem["price"] = null;
    if (f.priceStatus === "found") {
      const min = f.priceType === "free" ? 0 : f.priceMin;
      const max = f.priceType === "free" ? 0 : (f.priceMax ?? f.priceMin);
      if (min === undefined || max === undefined)
        throw new HttpError(400, "Enter a minimum price, or choose “Price not found”.");
      if (!f.priceSourceUrl) throw new HttpError(400, "Add the URL where this price is published.");
      price = {
        type: f.priceType,
        min: Math.round(min * 100),
        max: Math.round(max * 100),
        ...(f.priceChild !== undefined ? { child: Math.round(f.priceChild * 100) } : {}),
        currency: f.priceCurrency,
        source: f.priceSource,
        updatedAt: new Date().toISOString(),
        sourceUrl: f.priceSourceUrl,
        checkedAt: f.priceCheckedAt || new Date().toISOString().slice(0, 10),
        note: f.priceNote,
      };
    }
    const next = itemSchema.parse({
      ...current,
      name: f.name,
      nameRu: f.nameRu,
      nameKk: f.nameKk,
      slug: f.slug,
      category: f.category,
      region: f.region,
      city: f.city,
      address: f.address,
      lat: f.lat,
      lng: f.lng,
      description: f.description,
      descriptionRu: f.descriptionRu,
      descriptionKk: f.descriptionKk,
      hours: f.hours,
      duration: f.duration,
      season: f.season,
      transport: f.transport,
      website: f.website,
      phone: f.phone,
      outdoor: f.outdoor === "on",
      bookable: f.bookable === "on",
      status: f.status,
      photos,
      image: photos[0]?.url || (current.googlePlaceId ? "" : current.image),
      alt: photos[0]?.alt || current.alt,
      imageCredit: photos[0]?.author
        ? { author: photos[0].author, sourceUrl: photos[0].sourceUrl, licence: photos[0].licence, licenceUrl: photos[0].licenceUrl }
        : current.imageCredit,
      price,
      priceStatus: f.priceStatus,
      verifiedAt: new Date().toISOString(),
    });
    if (next.status === "approved" && !next.description)
      throw new HttpError(400, "Add an English description before publishing.");
    await updatePlace(next);
    await recordAudit(actor, "place.save", next.id, {
      status: next.status,
      priceStatus: next.priceStatus,
      statusChanged: current.status !== next.status,
    });
    revalidatePath("/admin/places");
    revalidatePath(`/places/${next.slug}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(path, failure(error), "bad");
  }
  back(path, "Saved.");
}

export async function removePlace(formData: FormData) {
  const id = z.string().max(120).parse(formData.get("id"));
  let outcome: "deleted" | "hidden";
  try {
    const actor = await authorize("places.delete");
    outcome = await deletePlace(id);
    await recordAudit(actor, outcome === "deleted" ? "place.delete" : "place.hide", id);
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/admin/places/${encodeURIComponent(id)}`, failure(error), "bad");
  }
  revalidatePath("/admin/places");
  if (outcome === "hidden")
    back("/admin/places", "This place is used by bookings or inventory, so it was hidden instead of deleted.");
  redirect("/admin/places?notice=Place%20deleted.");
}

/** Re-reads coordinates from Google (allowed cache window: 30 days). */
export async function refreshGoogle(formData: FormData) {
  const id = z.string().max(120).parse(formData.get("id"));
  const path = `/admin/places/${encodeURIComponent(id)}`;
  try {
    const actor = await authorize("places.write");
    const item = await getPlace(id);
    if (!item?.googlePlaceId) throw new HttpError(400, "This place is not linked to Google.");
    const g = await googleDetails(item.googlePlaceId, "id,location");
    if (!g.location) throw new HttpError(422, "Google returned no coordinates.");
    await updatePlace({ ...item, lat: g.location.latitude, lng: g.location.longitude, googleFetchedAt: new Date().toISOString() });
    await recordAudit(actor, "place.google.refresh", id);
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(path, failure(error), "bad");
  }
  back(path, "Coordinates refreshed from Google.");
}
