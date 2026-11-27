import { HttpError } from "@/lib/hub/security";
import { usage } from "@/lib/platform/store";
import type { Photo } from "@/lib/hub/types";
import { clean, fetchJson, guessCategory } from "../http";
import { ALMATY, type PlaceImport, type PlaceProvider, type PlaceSearchResult } from "../types";

/**
 * Free provider: Wikipedia (text CC BY-SA 4.0) + Wikimedia Commons photos.
 * Only photos with a CC BY / CC BY-SA / CC0 / public-domain licence are imported,
 * always with author, source and licence so the page can credit them.
 */
type Page = {
  pageid: number;
  title: string;
  extract?: string;
  fullurl?: string;
  pageimage?: string;
  thumbnail?: { source: string };
  coordinates?: { lat: number; lon: number }[];
  description?: string;
};
type Query = { query?: { pages?: Page[] } };
type CommonsPage = {
  title: string;
  imageinfo?: {
    url: string;
    thumburl?: string;
    descriptionurl: string;
    extmetadata?: Record<string, { value?: string } | undefined>;
  }[];
};

const api = (host: string, params: Record<string, string>) => {
  const url = new URL(`https://${host}/w/api.php`);
  for (const [k, v] of Object.entries({ action: "query", format: "json", formatversion: "2", ...params }))
    url.searchParams.set(k, v);
  return url;
};
const OPEN_LICENCE = /^(CC BY(-SA)?( \d\.\d)?|CC0|Public domain)/i;

export async function commonsPhotos(files: string[]): Promise<Photo[]> {
  if (!files.length) return [];
  const data = await fetchJson<{ query?: { pages?: CommonsPage[] } }>(
    api("commons.wikimedia.org", {
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: "1200",
      titles: files.slice(0, 20).map((f) => (f.startsWith("File:") ? f : `File:${f}`)).join("|"),
    }),
    { label: "Wikimedia Commons" },
  );
  const photos: Photo[] = [];
  for (const p of data.query?.pages || []) {
    const info = p.imageinfo?.[0];
    const meta = info?.extmetadata;
    const licence = clean(meta?.LicenseShortName?.value, 120);
    if (!info || !OPEN_LICENCE.test(licence)) continue;
    photos.push({
      url: info.thumburl || info.url,
      alt: clean(meta?.ImageDescription?.value, 280) || p.title.replace(/^File:/, ""),
      author: clean(meta?.Artist?.value, 280) || "Unknown author",
      sourceUrl: info.descriptionurl,
      licence,
      licenceUrl: String(meta?.LicenseUrl?.value || "").replace(/^http:/, "https:"),
      provider: "wikimedia",
    });
  }
  return photos;
}

export const wikipedia: PlaceProvider = {
  id: "wikipedia",
  label: "Wikipedia + Wikimedia Commons (free)",
  policy:
    "Stores coordinates, a source extract (CC BY-SA) and openly licensed Commons photos with author and licence credits.",
  configured: () => true,
  async search(query) {
    await usage("wikipedia-search");
    const data = await fetchJson<Query>(
      api("en.wikipedia.org", {
        generator: "search",
        gsrsearch: /almaty|алматы|kazakhstan/i.test(query) ? query : `${query} Almaty`,
        gsrlimit: "10",
        prop: "coordinates|pageimages|description|info",
        piprop: "thumbnail|name",
        pithumbsize: "320",
        inprop: "url",
      }),
      { label: "Wikipedia" },
    );
    return (data.query?.pages || [])
      .filter((p) => p.coordinates?.length)
      .map(
        (p): PlaceSearchResult => ({
          provider: "wikipedia",
          externalId: String(p.pageid),
          name: clean(p.title, 180),
          address: clean(p.description, 200),
          lat: p.coordinates?.[0]?.lat ?? null,
          lng: p.coordinates?.[0]?.lon ?? null,
          rating: null,
          ratingCount: null,
          photoUrl: p.thumbnail?.source || "",
          photoAttribution: p.thumbnail ? "Wikimedia Commons" : "",
          photoAttributionUrl: p.pageimage
            ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(p.pageimage)}`
            : "",
          category: guessCategory(p.title, p.description),
          mapsUrl: p.fullurl || `https://en.wikipedia.org/?curid=${p.pageid}`,
        }),
      );
  },
  async details(externalId) {
    if (!/^\d{1,12}$/.test(externalId)) throw new HttpError(400, "Invalid Wikipedia page id.");
    await usage("wikipedia-details");
    const data = await fetchJson<Query>(
      api("en.wikipedia.org", {
        pageids: externalId,
        prop: "extracts|coordinates|pageimages|description|info",
        exintro: "1",
        explaintext: "1",
        exchars: "1500",
        piprop: "name",
        inprop: "url",
      }),
      { label: "Wikipedia" },
    );
    const p = data.query?.pages?.[0];
    const c = p?.coordinates?.[0];
    if (!p || !c) throw new HttpError(404, "This Wikipedia article has no coordinates.");
    const photos = await commonsPhotos(p.pageimage ? [p.pageimage] : []).catch(() => []);
    const distance = Math.hypot(c.lat - ALMATY.lat, c.lon - ALMATY.lng);
    return {
      provider: "wikipedia",
      externalId,
      name: clean(p.title, 180),
      lat: c.lat,
      lng: c.lon,
      category: guessCategory(p.title, p.description, p.extract?.slice(0, 300)),
      address: distance > 0.5 ? "Almaty Region" : "Almaty",
      hours: "",
      website: "",
      phone: "",
      description: clean(p.extract, 1500),
      descriptionSourceUrl: p.fullurl || `https://en.wikipedia.org/?curid=${p.pageid}`,
      descriptionLicence: "CC BY-SA 4.0",
      photos,
      attribution: "Wikipedia (CC BY-SA 4.0), Wikimedia Commons",
      persisted: ["externalId", "name", "lat", "lng", "category", "description", "photos"],
      live: {},
    } satisfies PlaceImport;
  },
};
