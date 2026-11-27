import { HttpError } from "@/lib/hub/security";
import { usage } from "@/lib/platform/store";
import { clean, fetchJson, guessCategory } from "../http";
import { ALMATY, type PlaceImport, type PlaceProvider, type PlaceSearchResult } from "../types";
import { commonsPhotos } from "./wikipedia";

/**
 * OpenTripMap (free API key). Data © OpenStreetMap contributors (ODbL) and Wikipedia/Wikidata.
 * Photos are imported only via Wikimedia Commons with a verified open licence.
 */
type Suggest = {
  xid: string;
  name: string;
  kinds?: string;
  rate?: number;
  point?: { lon: number; lat: number };
};
type Detail = Suggest & {
  address?: Record<string, string>;
  url?: string;
  image?: string;
  otm?: string;
  wikipedia?: string;
  wikipedia_extracts?: { title?: string; text?: string };
};
const BASE = "https://api.opentripmap.com/0.1/en/places";
const key = () => {
  const k = process.env.OPENTRIPMAP_API_KEY;
  if (!k) throw new HttpError(503, "OPENTRIPMAP_API_KEY is not configured.");
  return k;
};
const address = (a?: Record<string, string>) =>
  clean(
    [
      [a?.road, a?.house_number].filter(Boolean).join(" "),
      a?.city || a?.town || a?.village,
      a?.state,
    ]
      .filter(Boolean)
      .join(", "),
    300,
  );

export const opentripmap: PlaceProvider = {
  id: "opentripmap",
  label: "OpenTripMap + Wikipedia (free)",
  policy:
    "Stores coordinates, address and text with OpenStreetMap (ODbL) / Wikipedia (CC BY-SA) attribution; photos only from Wikimedia Commons with an open licence.",
  configured: () => !!process.env.OPENTRIPMAP_API_KEY,
  async search(query) {
    await usage("opentripmap-search");
    const url = new URL(`${BASE}/autosuggest`);
    for (const [k, v] of Object.entries({
      name: query,
      radius: "300000",
      lon: String(ALMATY.lng),
      lat: String(ALMATY.lat),
      rate: "1",
      format: "json",
      limit: "12",
      apikey: key(),
    }))
      url.searchParams.set(k, v);
    const rows = await fetchJson<Suggest[]>(url, { label: "OpenTripMap" });
    return rows
      .filter((r) => r.name && r.point)
      .map(
        (r): PlaceSearchResult => ({
          provider: "opentripmap",
          externalId: r.xid,
          name: clean(r.name, 180),
          address: clean(r.kinds?.split(",").slice(0, 3).join(", ").replace(/_/g, " "), 200),
          lat: r.point?.lat ?? null,
          lng: r.point?.lon ?? null,
          rating: null,
          ratingCount: null,
          photoUrl: "",
          photoAttribution: "",
          photoAttributionUrl: "",
          category: guessCategory(r.kinds, r.name),
          mapsUrl: `https://opentripmap.com/en/card/${encodeURIComponent(r.xid)}`,
        }),
      );
  },
  async details(externalId) {
    if (!/^[A-Za-z0-9]{2,40}$/.test(externalId)) throw new HttpError(400, "Invalid OpenTripMap id.");
    await usage("opentripmap-details");
    const d = await fetchJson<Detail>(`${BASE}/xid/${externalId}?apikey=${key()}`, {
      label: "OpenTripMap",
    });
    if (!d.point) throw new HttpError(404, "OpenTripMap returned no coordinates.");
    const commonsFile = d.image?.match(/commons\.wikimedia\.org\/wiki\/(File:[^?#]+)/)?.[1];
    const photos = await commonsPhotos(commonsFile ? [decodeURIComponent(commonsFile)] : []).catch(
      () => [],
    );
    return {
      provider: "opentripmap",
      externalId: d.xid,
      name: clean(d.name, 180),
      lat: d.point.lat,
      lng: d.point.lon,
      category: guessCategory(d.kinds, d.name),
      address: address(d.address),
      hours: "",
      website: clean(d.url, 800),
      phone: "",
      description: clean(d.wikipedia_extracts?.text, 1500),
      descriptionSourceUrl: d.wikipedia || d.otm || "",
      descriptionLicence: d.wikipedia ? "CC BY-SA 4.0" : "ODbL",
      photos,
      attribution: "OpenTripMap · © OpenStreetMap contributors (ODbL) · Wikipedia",
      persisted: ["externalId", "name", "lat", "lng", "category", "address", "website", "description", "photos"],
      live: {},
    } satisfies PlaceImport;
  },
};
