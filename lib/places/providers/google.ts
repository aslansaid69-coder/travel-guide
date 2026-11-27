import { HttpError } from "@/lib/hub/security";
import { usage } from "@/lib/platform/store";
import type { GooglePlace } from "../google-types";
import { clean, fetchJson, guessCategory } from "../http";
import { ALMATY, type PlaceImport, type PlaceProvider, type PlaceSearchResult } from "../types";

/**
 * Google Places API (New). Terms-of-service rules enforced here:
 * - Only the place ID is stored indefinitely; coordinates may be cached for up to 30 days
 *   (googleFetchedAt marks when they must be refreshed).
 * - Address, hours, photos, rating and reviews are displayed live with Google attribution and
 *   never written to our database. Photos are proxied by /api/places/photo without storing them.
 * - Google content is never sent to the AI description generator.
 */
const BASE = "https://places.googleapis.com/v1";
const key = () => {
  const k = process.env.GOOGLE_PLACES_API_KEY;
  if (!k) throw new HttpError(503, "GOOGLE_PLACES_API_KEY is not configured.");
  return k;
};
export const googlePhotoUrl = (name: string, width = 400) =>
  `/api/places/photo?name=${encodeURIComponent(name)}&w=${width}`;
export const PHOTO_NAME = /^places\/[A-Za-z0-9_-]{8,300}\/photos\/[A-Za-z0-9_-]{8,600}$/;
export const PLACE_ID = /^[A-Za-z0-9_-]{8,300}$/;

const SEARCH_FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.photos",
  "places.googleMapsUri",
  "places.primaryType",
  "places.types",
].join(",");
export const DETAIL_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "photos",
  "googleMapsUri",
  "websiteUri",
  "nationalPhoneNumber",
  "regularOpeningHours",
  "primaryType",
  "types",
  "businessStatus",
].join(",");

export async function googleDetails(placeId: string, fields = DETAIL_FIELDS, language = "en") {
  if (!PLACE_ID.test(placeId)) throw new HttpError(400, "Invalid Google place ID.");
  await usage("google-places-details");
  return fetchJson<GooglePlace>(`${BASE}/places/${placeId}?languageCode=${language}`, {
    label: "Google Places",
    headers: { "X-Goog-Api-Key": key(), "X-Goog-FieldMask": fields },
  });
}

export const google: PlaceProvider = {
  id: "google",
  label: "Google Places",
  policy:
    "Stores only the place ID and (for 30 days) coordinates. Address, hours, photos and ratings are shown live from Google with attribution.",
  configured: () => !!process.env.GOOGLE_PLACES_API_KEY,
  async search(query) {
    await usage("google-places-search");
    const data = await fetchJson<{ places?: GooglePlace[] }>(`${BASE}/places:searchText`, {
      label: "Google Places",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key(),
        "X-Goog-FieldMask": SEARCH_FIELDS,
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: "en",
        pageSize: 10,
        locationBias: {
          circle: { center: { latitude: ALMATY.lat, longitude: ALMATY.lng }, radius: 50000 },
        },
      }),
    });
    return (data.places || []).map(
      (p): PlaceSearchResult => ({
        provider: "google",
        externalId: p.id,
        name: clean(p.displayName?.text, 180) || "Unnamed place",
        address: clean(p.formattedAddress, 300),
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
        rating: p.rating ?? null,
        ratingCount: p.userRatingCount ?? null,
        photoUrl: p.photos?.[0] ? googlePhotoUrl(p.photos[0].name, 320) : "",
        photoAttribution: p.photos?.[0]?.authorAttributions?.[0]?.displayName || "",
        photoAttributionUrl: p.photos?.[0]?.authorAttributions?.[0]?.uri || "",
        category: guessCategory(p.primaryType, ...(p.types || [])),
        mapsUrl: p.googleMapsUri || "",
      }),
    );
  },
  async details(externalId) {
    const p = await googleDetails(externalId);
    if (!p.location) throw new HttpError(422, "Google returned no coordinates for this place.");
    const result: PlaceImport = {
      provider: "google",
      externalId: p.id,
      name: clean(p.displayName?.text, 180),
      lat: p.location.latitude,
      lng: p.location.longitude,
      category: guessCategory(p.primaryType, ...(p.types || [])),
      address: "",
      hours: "",
      website: "",
      phone: "",
      description: "",
      descriptionSourceUrl: "",
      descriptionLicence: "",
      photos: [],
      attribution: "Google Maps",
      persisted: ["externalId", "name", "lat", "lng", "category"],
      live: {
        address: p.formattedAddress,
        hours: p.regularOpeningHours?.weekdayDescriptions,
        rating: p.rating,
        ratingCount: p.userRatingCount,
        website: p.websiteUri,
        phone: p.nationalPhoneNumber,
        mapsUrl: p.googleMapsUri,
      },
    };
    return result;
  },
};
