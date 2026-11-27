import { z } from "zod";
import { HttpError, limit } from "@/lib/hub/security";
import { PHOTO_NAME } from "@/lib/places/providers/google";
import { fetchJson } from "@/lib/places/http";
import { usage } from "@/lib/platform/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves a Google Places photo without exposing the API key and without storing the image:
 * asks Google for a short-lived photo URI and redirects the browser to it.
 */
const query = z.object({
  name: z.string().regex(PHOTO_NAME),
  w: z.coerce.number().int().min(80).max(1600).catch(800),
});

export async function GET(request: Request) {
  try {
    if (!process.env.GOOGLE_PLACES_API_KEY) throw new HttpError(404, "Photos unavailable.");
    const url = new URL(request.url);
    const q = query.safeParse({ name: url.searchParams.get("name"), w: url.searchParams.get("w") });
    if (!q.success) throw new HttpError(400, "Invalid photo reference.");
    await limit(request, "google-photo", 400);
    await usage("google-places-photo");
    const media = await fetchJson<{ photoUri?: string }>(
      `https://places.googleapis.com/v1/${q.data.name}/media?maxWidthPx=${q.data.w}&skipHttpRedirect=true`,
      {
        label: "Google Places photo",
        headers: { "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY },
      },
    );
    if (!media.photoUri?.startsWith("https://")) throw new HttpError(404, "Photo unavailable.");
    return new Response(null, {
      status: 302,
      headers: { Location: media.photoUri, "Cache-Control": "private, max-age=600" },
    });
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 503;
    return new Response(null, { status, headers: { "Cache-Control": "no-store" } });
  }
}
