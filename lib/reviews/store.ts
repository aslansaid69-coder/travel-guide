import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { database } from "@/lib/db";
import { HttpError } from "@/lib/hub/security";
import { googleDetails } from "@/lib/places/providers/google";
import type { GoogleReview } from "@/lib/places/google-types";

export const reviewInput = z.object({
  placeId: z.string().trim().min(1).max(120),
  rating: z.coerce.number().int().min(1).max(5),
  title: z.string().trim().max(120).default(""),
  body: z.string().trim().min(20, "Please write at least 20 characters.").max(3000),
  language: z.enum(["en", "ru", "kk"]).default("en"),
  authorName: z.string().trim().min(2).max(80),
});

/**
 * A traveller may review a place only after a completed trip that included it.
 * Returns the trip reference that proves it (self-service booking or travel-desk request),
 * or null when there is no eligible, not-yet-reviewed trip.
 */
export async function eligibleTrip(userId: string, placeId: string): Promise<string | null> {
  const sql = database();
  const rows = await sql`
    SELECT ref FROM (
      SELECT 'tour:' || b.id AS ref, b.completed_at AS at FROM tour_bookings b
        WHERE b.user_id=${userId} AND b.status='completed' AND b.place_ids ? ${placeId}
      UNION ALL
      SELECT 'desk:' || r.id, r.updated_at FROM hub_requests r
        JOIN hub_plans p ON p.id=r.plan_id
        LEFT JOIN hub_quotes q ON q.id=r.quote_id
        WHERE p.client_id=${userId} AND r.status='completed'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(q.plan, p.data)->'days') d,
                          jsonb_array_elements(d->'stops') s
            WHERE s->>'itemId'=${placeId})
    ) t
    WHERE NOT EXISTS (SELECT 1 FROM place_reviews pr WHERE pr.user_id=${userId} AND pr.place_id=${placeId} AND pr.booking_ref=t.ref)
    ORDER BY at DESC NULLS LAST LIMIT 1`;
  return rows[0] ? String(rows[0].ref) : null;
}

export async function submitReview(user: { id: string }, raw: unknown) {
  const input = reviewInput.parse(raw);
  const ref = await eligibleTrip(user.id, input.placeId);
  if (!ref)
    throw new HttpError(403, "Reviews are open to travellers after a completed trip that included this place.");
  const id = `rv_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  await database()`INSERT INTO place_reviews(id,place_id,user_id,author_name,booking_ref,rating,title,body,language,verified,status) VALUES(${id},${input.placeId},${user.id},${input.authorName},${ref},${input.rating},${input.title},${input.body},${input.language},true,'pending')`;
  return id;
}

export type PublicReview = {
  id: string;
  author: string;
  rating: number;
  title: string;
  body: string;
  language: string;
  verified: boolean;
  createdAt: string;
};
export async function approvedReviews(placeId: string, limit = 30) {
  const sql = database();
  const [rows, stats] = await Promise.all([
    sql`SELECT id,author_name,rating,title,body,language,verified,created_at FROM place_reviews WHERE place_id=${placeId} AND status='approved' ORDER BY created_at DESC LIMIT ${limit}`,
    sql`SELECT count(*)::int AS n, avg(rating)::float AS avg FROM place_reviews WHERE place_id=${placeId} AND status='approved'`,
  ]);
  return {
    reviews: rows.map(
      (r): PublicReview => ({
        id: String(r.id),
        author: String(r.author_name),
        rating: Number(r.rating),
        title: String(r.title),
        body: String(r.body),
        language: String(r.language),
        verified: Boolean(r.verified),
        createdAt: String(r.created_at),
      }),
    ),
    count: Number(stats[0]?.n || 0),
    average: stats[0]?.avg === null ? null : Number(stats[0]?.avg),
  };
}

export const moderationInput = z.object({
  id: z.string().trim().min(1).max(60),
  status: z.enum(["approved", "rejected", "pending"]),
  note: z.string().trim().max(500).default(""),
});
export async function moderateReview(raw: unknown, actorId: string) {
  const m = moderationInput.parse(raw);
  const rows =
    await database()`UPDATE place_reviews SET status=${m.status},moderation_note=${m.note},moderated_by=${actorId},moderated_at=now(),updated_at=now() WHERE id=${m.id} RETURNING place_id`;
  if (!rows.length) throw new HttpError(404, "Review not found.");
  return { ...m, placeId: String(rows[0].place_id) };
}

/**
 * Google reviews are displayed live with author attribution and never stored or edited
 * (Google Maps Platform terms). Returns null when Google is not configured or unavailable.
 */
export async function googleReviews(placeId: string, language: "en" | "ru" | "kk" = "en") {
  if (!placeId || !process.env.GOOGLE_PLACES_API_KEY) return null;
  try {
    const p = await googleDetails(placeId, "id,rating,userRatingCount,reviews,googleMapsUri", language);
    return {
      rating: p.rating ?? null,
      count: p.userRatingCount ?? 0,
      mapsUrl: p.googleMapsUri || "",
      reviews: (p.reviews || []).slice(0, 5).map((r: GoogleReview) => ({
        author: r.authorAttribution?.displayName || "Google user",
        authorUrl: r.authorAttribution?.uri || "",
        authorPhoto: r.authorAttribution?.photoUri || "",
        rating: r.rating ?? null,
        text: r.text?.text || r.originalText?.text || "",
        when: r.relativePublishTimeDescription || "",
        url: r.googleMapsUri || "",
      })),
    };
  } catch {
    return null;
  }
}
