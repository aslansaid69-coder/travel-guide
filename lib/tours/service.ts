import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { database } from "@/lib/db";
import { itemSchema, type CatalogItem } from "@/lib/hub/types";
import { guideSchema, type Guide } from "@/lib/platform/types";
import { HttpError } from "@/lib/hub/security";
import { estimateTour, EstimateError, type Estimate, type EstimateGuide, type EstimatePlace } from "@/lib/pricing/estimate";
import { defaultPricing, pricingSchema, type PricingSettings } from "@/lib/pricing/settings";
import { guideDayRate, matchGuides, type Match, type MatchCandidate } from "@/lib/guides/match";
import { ACTIVE_STATUSES } from "./status";

export const tourRequestSchema = z.object({
  placeIds: z.array(z.string().trim().min(1).max(120)).min(1).max(12),
  adults: z.coerce.number().int().min(1).max(40),
  children: z.coerce.number().int().min(0).max(40).default(0),
  startDate: z.iso.date().optional(),
  language: z.enum(["en", "ru", "kk"]).default("en"),
  guideId: z.string().trim().max(120).optional(),
});
export type TourRequest = z.infer<typeof tourRequestSchema>;

export async function pricingSettings(): Promise<PricingSettings> {
  try {
    const r = (await database()`SELECT data FROM app_settings WHERE key='pricing'`)[0];
    return r ? pricingSchema.parse({ ...defaultPricing, ...(r.data as object) }) : defaultPricing;
  } catch {
    return defaultPricing;
  }
}

/** Published places in the order the traveller chose them. */
export async function loadTourPlaces(ids: string[]): Promise<CatalogItem[]> {
  const unique = [...new Set(ids)];
  const rows =
    await database()`SELECT data,status FROM hub_catalog WHERE id = ANY(${unique}::text[]) AND status='approved'`;
  const byId = new Map(rows.map((r) => [String((r.data as { id: string }).id), itemSchema.parse({ ...(r.data as object), status: r.status })]));
  const missing = unique.filter((id) => !byId.has(id));
  if (missing.length) throw new HttpError(400, "Some selected places are no longer available. Please refresh your selection.");
  return unique.map((id) => byId.get(id)!);
}

/** Ticket for the estimate: unknown / not-found prices stay unknown (never invented). */
export function ticketOf(item: CatalogItem): EstimatePlace["ticket"] {
  if (item.priceStatus === "not_found" || !item.price) return null;
  const p = item.price;
  return {
    minMinor: p.type === "free" ? 0 : p.min,
    maxMinor: p.type === "free" ? 0 : p.max,
    childMinor: p.child,
    currency: p.currency,
    perPerson: p.type === "per-person" || p.type === "range" || p.type === "free",
  };
}

export const toEstimatePlace = (item: CatalogItem): EstimatePlace => ({
  id: item.id,
  name: item.name,
  lat: item.lat,
  lng: item.lng,
  durationMin: item.duration,
  ticket: ticketOf(item),
});

/** Regions a guide must cover: "Almaty" for city places, otherwise the place's region. */
export const regionsOf = (items: CatalogItem[]) => [...new Set(items.map((i) => i.region || "Almaty"))];

/** Trip window in Asia/Almaty: 09:00 on the start day until 21:00 on the last day. */
export function tripWindow(startDate: string, days: number) {
  const start = new Date(`${startDate}T09:00:00+05:00`);
  const end = new Date(start.valueOf() + (days - 1) * 86400000 + 12 * 3600000);
  return { start, end, endDate: new Date(end.valueOf() + 5 * 3600000).toISOString().slice(0, 10) };
}

async function guideCandidates(): Promise<MatchCandidate[]> {
  const sql = database();
  const [guides, windows, busy] = await Promise.all([
    sql`SELECT g.id,g.data,g.status,avg(v.rating) FILTER (WHERE v.status='approved') AS rating,count(v.id) FILTER (WHERE v.status='approved')::int AS reviews FROM guides g LEFT JOIN guide_assignments a ON a.guide_id=g.id LEFT JOIN guide_reviews v ON v.assignment_id=a.id WHERE g.status='active' GROUP BY g.id`,
    sql`SELECT guide_id,starts_at,ends_at,blocked FROM guide_availability WHERE ends_at > now()`,
    sql`SELECT guide_id,starts_at,ends_at FROM guide_assignments WHERE ends_at > now() AND (status IN ('accepted','started','completion_requested') OR (status='offered' AND expires_at > now()))
        UNION ALL
        SELECT guide_id,(start_date::timestamp AT TIME ZONE 'Asia/Almaty'),((end_date + 1)::timestamp AT TIME ZONE 'Asia/Almaty') FROM tour_bookings WHERE guide_id IS NOT NULL AND status = ANY(${ACTIVE_STATUSES as string[]}::text[]) AND (status <> 'pending' OR expires_at > now())`,
  ]);
  return guides.flatMap((g) => {
    const parsed = guideSchema.safeParse({ ...(g.data as object), status: g.status });
    if (!parsed.success) return [];
    const id = String(g.id);
    return [
      {
        guide: parsed.data,
        windows: windows
          .filter((w) => w.guide_id === id)
          .map((w) => ({ start: new Date(String(w.starts_at)), end: new Date(String(w.ends_at)), blocked: Boolean(w.blocked) })),
        busy: busy
          .filter((b) => b.guide_id === id)
          .map((b) => ({ start: new Date(String(b.starts_at)), end: new Date(String(b.ends_at)) })),
        reviewRating: g.rating === null ? null : Number(g.rating),
        reviewCount: Number(g.reviews || 0),
      },
    ];
  });
}

export type TourQuote = {
  estimate: Estimate;
  places: { id: string; slug: string; name: string; lat: number; lng: number; image: string; priceNote: string }[];
  regions: string[];
  guide: { id: string; name: string } | null;
  startDate?: string;
  endDate?: string;
};

/** The single entry point for prices shown anywhere (builder, assistant, checkout). */
export async function quoteTour(input: TourRequest): Promise<TourQuote & { matches?: Match[] }> {
  const settings = await pricingSettings();
  const items = await loadTourPlaces(input.placeIds);
  const candidates = await guideCandidates();
  let guide: EstimateGuide;
  let chosen: Guide | null = null;
  if (input.guideId) {
    chosen = candidates.find((c) => c.guide.id === input.guideId)?.guide ?? null;
    if (!chosen) throw new HttpError(400, "This guide is not available.");
    guide = { kind: "selected", id: chosen.id, name: chosen.name, dayRateMinor: guideDayRate(chosen) };
  } else {
    const rates = candidates.filter((c) => c.guide.currency === settings.currency).map((c) => guideDayRate(c.guide));
    guide = {
      kind: "market",
      count: rates.length,
      minDayMinor: rates.length ? Math.min(...rates) : 0,
      maxDayMinor: rates.length ? Math.max(...rates) : 0,
      averageDayMinor: rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : 0,
    };
  }
  let estimate: Estimate;
  try {
    estimate = estimateTour(
      { places: items.map(toEstimatePlace), adults: input.adults, children: input.children, guide },
      settings,
    );
  } catch (error) {
    if (error instanceof EstimateError) throw new HttpError(400, error.message);
    throw error;
  }
  const regions = regionsOf(items);
  const result: TourQuote & { matches?: Match[] } = {
    estimate,
    regions,
    guide: chosen ? { id: chosen.id, name: chosen.name } : null,
    places: items.map((i) => ({
      id: i.id,
      slug: i.slug || i.id,
      name: i.name,
      lat: i.lat,
      lng: i.lng,
      image: i.photos[0]?.url || i.image,
      priceNote: i.price?.note || (i.priceStatus === "not_found" ? "Price not published" : ""),
    })),
  };
  if (input.startDate) {
    const w = tripWindow(input.startDate, estimate.days);
    result.startDate = input.startDate;
    result.endDate = w.endDate;
    result.matches = matchGuides(candidates, {
      regions,
      language: input.language,
      start: w.start,
      end: w.end,
      currency: settings.currency,
    });
    if (chosen && !result.matches.some((m) => m.guide.id === chosen.id))
      throw new HttpError(409, "This guide is no longer free on these dates. Please choose another guide.");
  }
  return result;
}

/** Public guide card for travellers: no private email/phone before booking. */
export const publicMatch = (m: Match, lang: "en" | "ru" | "kk") => ({
  id: m.guide.id,
  name: m.guide.name,
  photo: m.guide.photo,
  bio: (lang === "kk" && m.guide.bioKk) || (lang !== "en" && m.guide.bioRu) || m.guide.bio,
  languages: m.guide.languages,
  specialties: m.guide.specialties,
  areas: m.guide.areas,
  experienceYears: m.guide.experienceYears,
  rating: m.rating,
  reviewCount: m.reviewCount,
  dayRateMinor: m.dayRateMinor,
  currency: m.guide.currency,
  calendarSet: m.calendarSet,
});
export type PublicGuideMatch = ReturnType<typeof publicMatch>;

export const bookingInputSchema = tourRequestSchema.extend({
  startDate: z.iso.date(),
  guideId: z.string().trim().min(1).max(120),
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(5).max(40),
  notes: z.string().trim().max(1000).default(""),
  acceptTerms: z.literal(true, { error: "Please accept the terms." }),
});

/** Creates a pending booking from a server-side re-quote (client numbers are never trusted). */
export async function createBooking(user: { id: string; email: string }, raw: unknown) {
  const input = bookingInputSchema.parse(raw);
  const today = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
  if (input.startDate <= today) throw new HttpError(400, "Choose a start date from tomorrow onwards.");
  const quote = await quoteTour(input);
  if (!quote.endDate) throw new HttpError(400, "Choose a start date.");
  const settings = await pricingSettings();
  const id = `tb_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const sql = database();
  await sql.transaction([
    sql`INSERT INTO tour_bookings(id,user_id,email,contact,place_ids,adults,children,start_date,end_date,days,guide_id,estimate,currency,estimate_min_minor,estimate_max_minor,amount_due_minor,status,notes,language,expires_at)
        VALUES(${id},${user.id},${user.email},${JSON.stringify({ name: input.name, phone: input.phone })}::jsonb,${JSON.stringify(input.placeIds)}::jsonb,${input.adults},${input.children},${input.startDate},${quote.endDate},${quote.estimate.days},${input.guideId},${JSON.stringify(quote.estimate)}::jsonb,${settings.currency},${quote.estimate.total.min},${quote.estimate.total.max},${quote.estimate.depositMinor},'pending',${input.notes},${input.language},now()+interval '45 minutes')`,
    sql`INSERT INTO tour_booking_events(booking_id,from_status,to_status,actor,note) VALUES(${id},NULL,'pending',${user.id},'Booking created by traveller')`,
  ]);
  return { id, quote };
}

export type BookingRow = {
  id: string;
  user_id: string;
  email: string;
  contact: { name?: string; phone?: string };
  place_ids: string[];
  adults: number;
  children: number;
  start_date: string;
  end_date: string;
  days: number;
  guide_id: string | null;
  guide_name: string | null;
  estimate: Estimate;
  currency: string;
  estimate_min_minor: number;
  estimate_max_minor: number;
  amount_due_minor: number;
  paid_minor: number;
  refunded_minor: number;
  status: import("./status").BookingStatus;
  notes: string;
  language: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
};

const num = (v: unknown) => Number(v ?? 0);
export function bookingFromRow(r: Record<string, unknown>): BookingRow {
  return {
    ...(r as unknown as BookingRow),
    start_date: String(r.start_date).slice(0, 10),
    end_date: String(r.end_date).slice(0, 10),
    estimate_min_minor: num(r.estimate_min_minor),
    estimate_max_minor: num(r.estimate_max_minor),
    amount_due_minor: num(r.amount_due_minor),
    paid_minor: num(r.paid_minor),
    refunded_minor: num(r.refunded_minor),
  };
}

export async function getBooking(id: string) {
  const r = (
    await database()`SELECT b.*,g.data->>'name' AS guide_name FROM tour_bookings b LEFT JOIN guides g ON g.id=b.guide_id WHERE b.id=${id}`
  )[0];
  return r ? bookingFromRow(r) : null;
}

/** A traveller sees only their own bookings; staff use the admin pages. */
export async function ownBooking(id: string, userId: string) {
  const b = await getBooking(id);
  if (!b || b.user_id !== userId) throw new HttpError(404, "Booking not found.");
  return b;
}
