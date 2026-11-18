import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { database } from "@/lib/db";
import { boundedBody } from "@/lib/updates/body";
import { publicAddress } from "@/lib/cameras/policy";
import { HttpError, hash, safeUrl } from "@/lib/hub/security";
import { catalog, saveCatalog, audit } from "@/lib/hub/store";
import {
  itemSchema,
  priceSchema,
  type Staff,
  type CatalogItem,
  type Price,
} from "@/lib/hub/types";
import { cached, usage } from "./store";
import type { ResearchDraft, ResearchField, Evidence } from "./types";
const agent =
  "AlmatyGuideResearchBot/2.0 (+https://almaty-travel-guide.vercel.app/credits)";
const clean = (v: unknown, max = 1800) =>
  String(v || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
export function publicResearchAddress(ip: string) {
  return (
    publicAddress(ip) &&
    !/^192\.0\./.test(ip) &&
    !/^192\.88\.99\./.test(ip) &&
    !/^198\.51\.100\./.test(ip) &&
    !/^203\.0\.113\./.test(ip) &&
    ip !== "168.63.129.16"
  );
}
export function researchURL(raw: string, hosts: string[]) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new HttpError(400, "Use a public HTTPS URL.");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    isIP(u.hostname) ||
    !hosts.includes(u.hostname.toLowerCase()) ||
    [...u.searchParams.keys()].some((k) =>
      /^(token|key|api_key|signature|x-amz-.+)$/i.test(k),
    )
  )
    throw new HttpError(400, "This URL is not an approved public source.");
  return u;
}
async function pinned(
  raw: string,
  hosts: string[],
  maxBytes = 1200000,
  redirects = 0,
): Promise<{ status: number; text: string; url: string }> {
  if (redirects > 3) throw new Error("Source redirected too often.");
  const u = researchURL(raw, hosts);
  const addresses = await lookup(u.hostname, { all: true, family: 4 });
  if (
    !addresses.length ||
    addresses.some((a) => !publicResearchAddress(a.address))
  )
    throw new Error("Source resolves to a non-public address.");
  const response = await new Promise<{
    status: number;
    text: string;
    location?: string;
  }>((resolve, reject) => {
    const req = httpsRequest(
      u,
      {
        headers: {
          "User-Agent": agent,
          Accept: "text/html,application/json,text/plain",
        },
        lookup: (_h, opts, cb) => {
          if (opts.all) (cb as any)(null, addresses);
          else cb(null, addresses[0].address, 4);
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          resolve({
            status: res.statusCode,
            text: "",
            location: res.headers.location,
          });
          return;
        }
        res.on("data", (b: Buffer) => {
          size += b.length;
          if (size > maxBytes)
            res.destroy(new Error("Source exceeds size limit."));
          else chunks.push(b);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode || 0,
            text: Buffer.concat(chunks).toString("utf8"),
          }),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(8000, () => req.destroy(new Error("Source timed out.")));
    req.on("error", reject);
    req.end();
  });
  if (response.location)
    return pinned(
      new URL(response.location, u).href,
      hosts,
      maxBytes,
      redirects + 1,
    );
  return { ...response, url: u.href };
}
export function robotsAllowed(text: string, path: string) {
  let groupAgents: string[] = [],
    rules: { allow: boolean; pattern: string }[] = [],
    bestRules: typeof rules = [],
    bestAgent = -1;
  const finish = () => {
    const specificity = groupAgents.reduce(
      (m, a) =>
        a === "*"
          ? Math.max(m, 0)
          : agent.toLowerCase().startsWith(a)
            ? Math.max(m, a.length)
            : m,
      -1,
    );
    if (specificity < 0) return;
    if (specificity > bestAgent) {
      bestAgent = specificity;
      bestRules = [...rules];
    } else if (specificity === bestAgent) bestRules.push(...rules);
  };
  let seenRule = false;
  for (const raw of text.split("\n")) {
    const line = raw.split("#")[0].trim(),
      i = line.indexOf(":");
    if (i < 0) continue;
    const key = line.slice(0, i).toLowerCase(),
      value = line.slice(i + 1).trim();
    if (key === "user-agent") {
      if (seenRule) {
        finish();
        groupAgents = [];
        rules = [];
        seenRule = false;
      }
      groupAgents.push(value.toLowerCase());
    } else if (["allow", "disallow"].includes(key) && groupAgents.length) {
      seenRule = true;
      if (value) rules.push({ allow: key === "allow", pattern: value });
    }
  }
  finish();
  let winner: { allow: boolean; score: number } | null = null;
  for (const r of bestRules) {
    const expression =
      "^" +
      r.pattern
        .split("*")
        .map((p) => p.replace(/[.+?^{}()|[\]\\]/g, "\\$&"))
        .join(".*")
        .replace(/\\\$$/, "$");
    let match = false;
    try {
      match = new RegExp(expression).test(path);
    } catch {}
    if (match) {
      const score = r.pattern.replace(/[*$]/g, "").length;
      if (
        !winner ||
        score > winner.score ||
        (score === winner.score && r.allow)
      )
        winner = { allow: r.allow, score };
    }
  }
  return winner?.allow ?? true;
}
export async function allowedSources() {
  const db = await database()`SELECT host FROM research_sources`;
  return [
    ...new Set([
      ...(process.env.RESEARCH_ALLOWED_HOSTS || "")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
      ...db.map((r) => r.host),
    ]),
  ];
}
export async function officialPage(raw: string) {
  const hosts = await allowedSources(),
    u = researchURL(raw, hosts);
  const robots = await cached(`robots:${u.hostname}`, 86400, async () => {
    const r = await pinned(`${u.origin}/robots.txt`, hosts, 100000);
    if (r.status === 404) return "";
    if (r.status !== 200)
      throw new Error("Source robots policy is unavailable.");
    return r.text;
  });
  if (!robotsAllowed(robots, u.pathname + u.search))
    throw new Error("Source disallows automated access.");
  await usage("official-research");
  const r = await pinned(u.href, hosts);
  if (r.status !== 200) throw new Error("Official source unavailable.");
  return r;
}
export function extractOffers(
  html: string,
  url: string,
): { price: Price; confidence: number; evidence: string }[] {
  const scripts = [
    ...html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  const found: { price: Price; confidence: number; evidence: string }[] = [];
  function visit(v: unknown, depth = 0) {
    if (depth > 12 || !v || typeof v !== "object" || found.length > 50) return;
    if (Array.isArray(v)) {
      v.slice(0, 100).forEach((x) => visit(x, depth + 1));
      return;
    }
    const o = v as Record<string, any>,
      types = Array.isArray(o["@type"]) ? o["@type"] : [o["@type"]];
    if (types.some((t: string) => t === "Offer" || t === "AggregateOffer")) {
      const numeric = (v: unknown) =>
        typeof v === "number" && Number.isFinite(v)
          ? v
          : typeof v === "string" && /^\d+(?:\.\d+)?$/.test(v.trim())
            ? Number(v)
            : NaN;
      const currency = String(o.priceCurrency || "").toUpperCase(),
        low = numeric(o.lowPrice ?? o.price),
        high = numeric(o.highPrice ?? o.price);
      if (
        o.priceValidUntil &&
        new Date(String(o.priceValidUntil) + "T23:59:59Z") < new Date()
      )
        return;
      if (
        ["KZT", "USD", "EUR", "RUB", "GBP"].includes(currency) &&
        Number.isFinite(low) &&
        Number.isFinite(high) &&
        low >= 0 &&
        high >= low
      ) {
        const label = clean(o.name || o.description, 200),
          group = /per group|за группу|group price/i.test(label),
          person = /per person|adult|взросл|за человека/i.test(label),
          p = priceSchema.safeParse({
            type:
              low === 0 && high === 0
                ? "free"
                : group
                  ? "per-group"
                  : person
                    ? "per-person"
                    : "range",
            min: Math.round(low * 100),
            max: Math.round(high * 100),
            currency,
            source: "estimated",
            updatedAt: new Date().toISOString(),
            note: `Structured official offer; verify age basis, taxes and inclusions. ${label}`.slice(
              0,
              300,
            ),
          });
        if (p.success)
          found.push({
            price: p.data,
            confidence: person || group ? 0.9 : 0.65,
            evidence: `${url} · ${label || "Offer"} · ${low}–${high} ${currency}`,
          });
      }
    }
    for (const x of Object.values(o)) visit(x, depth + 1);
  }
  for (const s of scripts) {
    try {
      visit(JSON.parse(s[1]));
    } catch {}
  }
  return found;
}
async function wiki(host: string, params: Record<string, string>) {
  const key = `wiki:${host}:${hash(JSON.stringify(params))}`;
  return cached<any>(key, 86400, async () => {
    await usage("wikimedia");
    const url = new URL(`https://${host}/w/api.php`);
    for (const [k, v] of Object.entries({
      action: "query",
      format: "json",
      formatversion: "2",
      ...params,
    }))
      url.searchParams.set(k, v);
    const r = await fetch(url, {
      headers: { "User-Agent": agent },
      signal: AbortSignal.timeout(8000),
      redirect: "error",
      cache: "no-store",
    });
    if (!r.ok) throw new Error("Wikimedia source unavailable.");
    return JSON.parse(await boundedBody(r, 1800000));
  });
}
async function wikiPhotos(fileNames: string[]) {
  if (!fileNames.length) return new Map<string, any>();
  const response = await wiki("commons.wikimedia.org", {
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "900",
    titles: fileNames
      .slice(0, 30)
      .map((f) => (f.startsWith("File:") ? f : "File:" + f))
      .join("|"),
  });
  const map = new Map<string, any>();
  for (const p of response.query?.pages || []) {
    const i = p.imageinfo?.[0],
      m = i?.extmetadata;
    if (!i || !m) continue;
    const licence = clean(m.LicenseShortName?.value, 120);
    if (!/^(CC BY(?:-SA)?|CC0|Public domain)/i.test(licence)) continue;
    const image = safeUrl(i.thumburl || i.url),
      credit = {
        author: clean(m.Artist?.value, 500),
        sourceUrl: safeUrl(i.descriptionurl),
        licence,
        licenceUrl: safeUrl(
          String(m.LicenseUrl?.value || "").replace(/^http:/, "https:"),
        ),
      };
    if (image && credit.sourceUrl)
      map.set(p.title.replace(/^File:/, "").replace(/_/g, " "), {
        image,
        credit,
      });
  }
  return map;
}
export async function webLinks(query: string) {
  if (!process.env.TAVILY_API_KEY) return [];
  await usage("tavily");
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `${query} Almaty official prices tickets`,
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    }),
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  if (!r.ok) return [];
  const d = JSON.parse(await boundedBody(r, 200000));
  return (d.results || [])
    .map((x: any) => ({ title: clean(x.title, 180), url: safeUrl(x.url) }))
    .filter((x: any) => x.url);
}
export function queryFromMaps(value: string) {
  if (!/^https:\/\//.test(value)) return { query: value, googlePlaceId: "" };
  const u = new URL(value);
  if (
    ![
      "google.com",
      "www.google.com",
      "maps.google.com",
      "maps.app.goo.gl",
    ].includes(u.hostname)
  )
    throw new HttpError(400, "Use a Google Maps link or a place name.");
  const place =
    u.searchParams.get("query_place_id") ||
    u.searchParams.get("place_id") ||
    u.pathname.match(/!1s([^!]+)/)?.[1] ||
    "";
  const name =
    u.pathname.match(/\/place\/([^/]+)/)?.[1] ||
    u.searchParams.get("query") ||
    u.searchParams.get("q") ||
    "";
  return {
    query: decodeURIComponent(name).replace(/\+/g, " ").slice(0, 300),
    googlePlaceId: place.slice(0, 220),
  };
}
export async function research(
  query: string,
  actor: string,
  bulk = false,
  radiusKm = 20,
  category = "activity",
) {
  const parsed = queryFromMaps(query),
    warnings: string[] = [];
  if (!parsed.query) {
    if (parsed.googlePlaceId) {
      const id = randomUUID();
      const draft: ResearchDraft = {
        id,
        query,
        item: { googlePlaceId: parsed.googlePlaceId },
        fields: {},
        googlePlaceId: parsed.googlePlaceId,
        price: null,
        warnings: [
          "This link supplies a Place ID. Add an independent source/name before publication; Google details remain live-only.",
        ],
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      await database()`INSERT INTO research_drafts(id,query,data,actor) VALUES(${id},${query},${JSON.stringify(draft)}::jsonb,${actor})`;
      return { drafts: [draft], warnings: draft.warnings, links: [] };
    }
    throw new HttpError(
      400,
      "Use a full named Google Maps URL or type the place name.",
    );
  }
  if (bulk) {
    try {
      const drafts = await osmDrafts(parsed.query, category, radiusKm);
      if (drafts.length) {
        await audit(actor, "research.search", query, {
          count: drafts.length,
          bulk,
          radiusKm,
          provider: "osm",
        });
        return {
          drafts,
          warnings,
          links: await webLinks(parsed.query).catch(() => []),
        };
      }
    } catch {
      warnings.push(
        "The OSM 20 km source is unavailable; using independently sourced Wikipedia results within 10 km.",
      );
    }
  }
  let pages: any[] = [];
  try {
    let ids: string[] = [];
    if (bulk) {
      const geo = await wiki("en.wikipedia.org", {
        list: "geosearch",
        gscoord: "43.2389|76.8897",
        gsradius: String(Math.min(radiusKm * 1000, 10000)),
        gslimit: "50",
      });
      ids = (geo.query?.geosearch || [])
        .slice(0, 30)
        .map((p: any) => String(p.pageid));
      if (radiusKm > 10)
        warnings.push(
          "The Wikipedia fallback covers 10 km; wider discovery needs an available OSM/Places provider.",
        );
    } else {
      const search = await wiki("en.wikipedia.org", {
        list: "search",
        srsearch: `${parsed.query} Almaty`,
        srlimit: "5",
      });
      ids = (search.query?.search || [])
        .slice(0, 3)
        .map((p: any) => String(p.pageid));
    }
    if (ids.length) {
      const data = await wiki("en.wikipedia.org", {
        pageids: ids.join("|"),
        prop: "extracts|coordinates|pageimages|info|langlinks",
        exintro: "1",
        explaintext: "1",
        exchars: "1200",
        inprop: "url",
        piprop: "name",
        lllang: "ru",
        lllimit: "max",
        colimit: "max",
      });
      pages = data.query?.pages || [];
    }
  } catch {
    warnings.push(
      "Wikimedia research is unavailable; existing drafts and published records are unchanged.",
    );
  }
  let russianPages = new Map<string, any>();
  const russianTitles = pages
    .map((p) => p.langlinks?.[0]?.title)
    .filter(Boolean);
  if (russianTitles.length)
    try {
      const ru = await wiki("ru.wikipedia.org", {
        titles: russianTitles.join("|"),
        prop: "extracts",
        exintro: "1",
        explaintext: "1",
        exchars: "1500",
      });
      russianPages = new Map(
        (ru.query?.pages || []).map((p: any) => [p.title, p]),
      );
    } catch {
      warnings.push(
        "Russian source text is unavailable. The optional translator can prepare a draft later.",
      );
    }
  const licensedPhotos = await wikiPhotos(
    pages.map((p) => p.pageimage).filter(Boolean),
  ).catch(() => new Map());
  const drafts: ResearchDraft[] = [];
  const existing = await catalog(true);
  for (const p of pages) {
    const coordinates = p.coordinates?.[0],
      photo = licensedPhotos.get(String(p.pageimage || "").replace(/_/g, " ")),
      source = `https://en.wikipedia.org/?curid=${p.pageid}`,
      checkedAt = new Date().toISOString();
    const evidence: Evidence = {
      source: "Wikipedia",
      url: source,
      checkedAt,
      confidence: 0.7,
      licence: "CC BY-SA 4.0",
      persistence: "licensed",
    };
    const ruTitle = p.langlinks?.[0]?.title || "";
    const item: ResearchDraft["item"] = {
      id: `wiki-${p.pageid}`,
      name: clean(p.title, 180),
      nameRu: clean(ruTitle, 180),
      description: clean(p.extract, 1500),
      descriptionRu: clean(russianPages.get(ruTitle)?.extract, 1500),
      category: itemSchema.shape.category.safeParse(category).success
        ? (category as CatalogItem["category"])
        : "activity",
      ...(coordinates ? { lat: coordinates.lat, lng: coordinates.lon } : {}),
      image: photo?.image || "",
      imageCredit: photo?.credit,
      source: "Wikipedia · CC BY-SA 4.0",
      sourceUrl: source,
      googlePlaceId: parsed.googlePlaceId,
      status: "pending",
      duration: 90,
      outdoor: !["museum", "restaurant", "cafe", "shop"].includes(category),
    };
    const fields: Record<string, ResearchField> = {
      name: { value: item.name, evidence },
      description: { value: item.description, evidence },
      nameRu: {
        value: item.nameRu,
        evidence: {
          ...evidence,
          url: ruTitle
            ? `https://ru.wikipedia.org/wiki/${encodeURIComponent(ruTitle)}`
            : source,
          confidence: ruTitle ? 0.8 : 0,
        },
      },
      duration: {
        value: 90,
        evidence: {
          source: "Planning rule",
          url: source,
          checkedAt,
          confidence: 0.3,
          persistence: "owner",
          note: "Default planning duration; owner must review.",
        },
      },
    };
    if (item.descriptionRu)
      fields.descriptionRu = {
        value: item.descriptionRu,
        evidence: {
          ...evidence,
          source: "Russian Wikipedia",
          url: `https://ru.wikipedia.org/wiki/${encodeURIComponent(ruTitle)}`,
          confidence: 0.7,
        },
      };
    if (coordinates)
      fields.coordinates = {
        value: { lat: item.lat, lng: item.lng },
        evidence: { ...evidence, confidence: 0.85 },
      };
    if (photo)
      fields.image = {
        value: photo.image,
        evidence: {
          ...evidence,
          source: "Wikimedia Commons",
          url: photo.credit.sourceUrl,
          licence: photo.credit.licence,
          confidence: 0.95,
        },
      };
    const duplicate = existing.find(
      (i) =>
        i.id === item.id || i.name.toLowerCase() === item.name?.toLowerCase(),
    );
    const draft: ResearchDraft = {
      id: randomUUID(),
      query,
      item,
      fields,
      googlePlaceId: parsed.googlePlaceId,
      price: null,
      warnings: [
        ...warnings,
        ...(!coordinates
          ? ["Coordinates need an independent source before publication."]
          : []),
        ...(duplicate
          ? [
              `Possible duplicate: ${duplicate.name} (${duplicate.id}). Publishing updates that record only after review.`,
            ]
          : []),
      ],
      status: "pending",
      createdAt: checkedAt,
    };
    await database()`INSERT INTO research_drafts(id,query,data,actor) VALUES(${draft.id},${query},${JSON.stringify(draft)}::jsonb,${actor})`;
    drafts.push(draft);
  }
  const links = await webLinks(parsed.query).catch(() => []);
  if (!drafts.length)
    warnings.push(
      "No independently sourced draft could be verified. Add a permitted source or configure search/Places access; no invented results were created.",
    );
  await audit(actor, "research.search", query, {
    count: drafts.length,
    bulk,
    radiusKm,
  });
  return { drafts, warnings, links };
}
export async function findPrices(
  url: string,
  draftId?: string,
  itemId?: string,
) {
  const page = await officialPage(url),
    offers = extractOffers(page.text, page.url);
  if (!offers.length)
    return {
      offers: [],
      message: "No valid structured price offer found. Price remains unknown.",
    };
  const sql = database();
  if (draftId) {
    const r = (
      await sql`SELECT data FROM research_drafts WHERE id=${draftId} AND status='pending'`
    )[0];
    if (r) {
      const d = r.data as ResearchDraft;
      d.price = offers[0].price;
      d.fields.price = {
        value: d.price,
        evidence: {
          source: "Official structured offer",
          url,
          checkedAt: new Date().toISOString(),
          confidence: offers[0].confidence,
          persistence: "licensed",
          note: offers[0].evidence,
        },
      };
      await sql`UPDATE research_drafts SET data=${JSON.stringify(d)}::jsonb,updated_at=now() WHERE id=${draftId}`;
    }
  }
  if (itemId)
    await sql`INSERT INTO research_watches(item_id,url,last_checked,snapshot,status) VALUES(${itemId},${url},now(),${JSON.stringify(offers[0])}::jsonb,'review') ON CONFLICT(item_id) DO UPDATE SET url=EXCLUDED.url,last_checked=now(),snapshot=EXCLUDED.snapshot,status='review',last_error=NULL`;
  return { offers };
}
export async function publishResearch(
  id: string,
  input: unknown,
  staff: Staff,
  confirmPrice = false,
) {
  const sql = database(),
    d = (
      await sql`SELECT data FROM research_drafts WHERE id=${id} AND status='pending'`
    )[0];
  if (!d) throw new HttpError(404, "Draft not found.");
  const draft = d.data as ResearchDraft;
  const item = itemSchema.parse({
    ...draft.item,
    ...(input as object),
    status: "approved",
    researchEvidence: draft.fields,
  });
  if (item.price)
    item.price = {
      ...item.price,
      source: confirmPrice ? "owner-confirmed" : "estimated",
      updatedAt: new Date().toISOString(),
    };
  await saveCatalog(item, staff);
  await sql`UPDATE research_drafts SET status='published',updated_at=now() WHERE id=${id}`;
  await audit(staff.id, "research.publish", item.id, {
    draft: id,
    confirmPrice,
  });
  return item;
}
// Only IDs are persisted from Google. Details stay in this response and are never sent to the text generator.
export async function googleLive(query: string) {
  if (!process.env.GOOGLE_PLACES_API_KEY)
    throw new HttpError(
      503,
      "Configure the server-only Google Places API key for live reference results.",
    );
  await usage("google-places-research");
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.regularOpeningHours,places.rating,places.userRatingCount,places.googleMapsUri,places.businessStatus,places.attributions,places.priceLevel",
    },
    body: JSON.stringify({
      textQuery: query + " Almaty",
      pageSize: 20,
      locationBias: {
        circle: {
          center: { latitude: 43.2389, longitude: 76.8897 },
          radius: 20000,
        },
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    redirect: "error",
  });
  if (!r.ok) throw new HttpError(503, "Google live reference is unavailable.");
  const d = JSON.parse(await boundedBody(r, 250000));
  for (const p of d.places || [])
    await database()`INSERT INTO content_candidates(source_key,external_id,kind,data) VALUES('google.place-ids',${p.id},'places',${JSON.stringify({ id: p.id, googlePlaceId: p.id, requiresOwnerContent: true })}::jsonb) ON CONFLICT DO NOTHING`;
  return { places: d.places || [], attribution: "Google Maps", liveOnly: true };
}
async function osmDrafts(query: string, category: string, radiusKm: number) {
  const { overpass } = await import("@/lib/hub/discovery");
  const tag =
    category === "restaurant"
      ? "[amenity=restaurant]"
      : category === "cafe"
        ? "[amenity=cafe]"
        : category === "museum"
          ? "[tourism=museum]"
          : category === "viewpoint"
            ? "[tourism=viewpoint]"
            : '[tourism~"attraction|museum|viewpoint"]';
  const result = await cached<any>(
    `research:osm:${category}:${radiusKm}`,
    86400,
    () =>
      overpass(
        `[out:json][timeout:10];nwr(around:${Math.min(20000, radiusKm * 1000)},43.2389,76.8897)${tag}[name];out center tags 30;`,
      ),
  );
  const drafts: ResearchDraft[] = [];
  const existing = await catalog(true);
  for (const e of result.elements || []) {
    const t = e.tags || {},
      lat = e.lat ?? e.center?.lat,
      lng = e.lon ?? e.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const source = `https://www.openstreetmap.org/${e.type}/${e.id}`,
      checkedAt = new Date().toISOString(),
      evidence: Evidence = {
        source: "© OpenStreetMap contributors",
        url: source,
        checkedAt,
        confidence: 0.75,
        persistence: "licensed",
        licence: "ODbL 1.0",
      };
    const item: ResearchDraft["item"] = {
      id: `osm-${e.type}-${e.id}`,
      osmId: `${e.type}/${e.id}`,
      name: clean(t["name:en"] || t.name, 180),
      nameRu: clean(t["name:ru"] || "", 180),
      description: "",
      descriptionRu: "",
      category: category as CatalogItem["category"],
      lat,
      lng,
      address: clean(
        [t["addr:street"], t["addr:housenumber"], t["addr:city"]]
          .filter(Boolean)
          .join(", "),
        500,
      ),
      hours: clean(t.opening_hours, 400),
      website: safeUrl(t.website || t["contact:website"] || ""),
      phone: clean(t.phone || t["contact:phone"], 100),
      accessibility: clean(
        t.wheelchair
          ? `Wheelchair: ${t.wheelchair}; verify with the venue.`
          : "",
        500,
      ),
      source: "© OpenStreetMap contributors · ODbL",
      sourceUrl: source,
      verifiedAt: checkedAt,
      status: "pending",
      duration: 90,
      outdoor: !["restaurant", "cafe", "museum", "shop"].includes(category),
    };
    const fields: Record<string, ResearchField> = {};
    for (const key of [
      "name",
      "nameRu",
      "address",
      "hours",
      "website",
      "phone",
      "accessibility",
      "lat",
      "lng",
    ] as const)
      if (item[key] !== undefined && item[key] !== "")
        fields[key] = { value: item[key], evidence };
    const draft: ResearchDraft = {
      id: randomUUID(),
      query,
      item,
      fields,
      price: null,
      warnings: [
        ...(existing.some(
          (i) =>
            i.id === item.id ||
            i.name.toLowerCase() === item.name?.toLowerCase(),
        )
          ? [
              "Possible duplicate in the published catalog; choose the existing record ID to update it.",
            ]
          : []),
        "OSM coverage varies. Unknown descriptions, prices and schedules stay blank until verified.",
      ],
      status: "pending",
      createdAt: checkedAt,
    };
    await database()`INSERT INTO research_drafts(id,query,data,actor) VALUES(${draft.id},${query},${JSON.stringify(draft)}::jsonb,'research-osm')`;
    drafts.push(draft);
  }
  return drafts;
}
