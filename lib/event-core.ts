export { visibleEvents } from "./event-view";
import { XMLParser } from "fast-xml-parser";

export type TravelEvent = {
  id: string;
  title: string;
  startDate: string;
  endDate?: string;
  dateOnly?: boolean;
  place: string;
  category: string;
  description: string;
  image: string;
  imageAlt: string;
  imageLabel?: string;
  sourceName: string;
  sourceUrl: string;
  verifiedAt?: string;
};
export type EventSource = {
  id: string;
  name: string;
  url: string;
  format: "json" | "rss";
  enabled: boolean;
  permissionConfirmed: boolean;
  permissionNote: string;
  tokenEnv?: string;
};
export function safeHttps(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
function validDate(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2}))?$/.test(
      value,
    )
  )
    return false;
  const date = new Date(value);
  return (
    !Number.isNaN(date.valueOf()) &&
    new Date(value.slice(0, 10)).toISOString().slice(0, 10) ===
      value.slice(0, 10)
  );
}
export function normalizeEvent(value: unknown): TravelEvent | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Record<string, unknown>;
  const textFields = [
    "id",
    "title",
    "place",
    "category",
    "description",
    "sourceName",
  ];
  if (
    !textFields.every(
      (k) =>
        typeof e[k] === "string" &&
        (e[k] as string).trim().length > 0 &&
        (e[k] as string).length <= 3000,
    )
  )
    return null;
  if (!validDate(e.startDate) || !safeHttps(e.sourceUrl)) return null;
  if (
    e.endDate !== undefined &&
    (!validDate(e.endDate) || new Date(e.endDate) < new Date(e.startDate))
  )
    return null;
  // Only bundled, licensed images render automatically. Add approved assets locally first.
  const localImage =
    typeof e.image === "string" &&
    /^\/images\/[\w-]+\.(jpg|png|webp)$/.test(e.image);
  return {
    id: e.id as string,
    title: e.title as string,
    place: e.place as string,
    category: e.category as string,
    description: (e.description as string)
      .replace(/<[^>]*>/g, "")
      .slice(0, 500),
    startDate: e.startDate,
    ...(e.endDate ? { endDate: e.endDate as string } : {}),
    dateOnly: e.dateOnly === true || e.startDate.length === 10,
    sourceUrl: e.sourceUrl,
    sourceName: e.sourceName as string,
    image: localImage ? (e.image as string) : "/images/kok-tobe.jpg",
    imageAlt:
      localImage && typeof e.imageAlt === "string"
        ? e.imageAlt
        : "Almaty city scenery; editorial image, not an event photograph",
    imageLabel:
      typeof e.imageLabel === "string" ? e.imageLabel : "Almaty city scenery",
    verifiedAt: typeof e.verifiedAt === "string" ? e.verifiedAt : undefined,
  };
}
export function parseEventFeed(
  body: string,
  source: EventSource,
): TravelEvent[] {
  let records: unknown[];
  if (source.format === "json") {
    const data = JSON.parse(body);
    records = Array.isArray(data) ? data : data.events;
  } else {
    // This is an event RSS contract, not news RSS. Never use pubDate as an event date.
    const parser = new XMLParser({
      ignoreAttributes: false,
      processEntities: false,
    });
    const rss = parser.parse(body);
    const items = rss?.rss?.channel?.item || [];
    const list = Array.isArray(items) ? items : [items];
    records = list.map((i: Record<string, unknown>) => ({
      id: `${source.id}:${typeof i.guid === "string" ? i.guid : i.link}`,
      title: i.title,
      startDate: i["event:startDate"],
      endDate: i["event:endDate"],
      place: i["event:location"],
      category: i.category || "Culture",
      description: i.description,
      sourceUrl: i.link,
      sourceName: source.name,
    }));
  }
  if (!Array.isArray(records))
    throw new Error("Feed must contain an events array");
  return records
    .slice(0, 500)
    .map(normalizeEvent)
    .filter((e): e is TravelEvent => e !== null);
}
export async function fetchEventSources(
  sources: EventSource[],
  seeds: unknown[],
  fetcher: typeof fetch = fetch,
) {
  const warnings: string[] = [];
  const remote = await Promise.all(
    sources
      .filter(
        (s) => s.enabled && s.permissionConfirmed && s.permissionNote.trim(),
      )
      .map(async (s) => {
        try {
          if (!safeHttps(s.url)) throw new Error("Feed requires HTTPS");
          const token = s.tokenEnv ? process.env[s.tokenEnv] : undefined;
          if (s.tokenEnv && !token)
            throw new Error("Missing configured feed token");
          const response = await fetcher(s.url, {
            headers: {
              Accept:
                s.format === "json"
                  ? "application/json"
                  : "application/rss+xml, application/xml",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            signal: AbortSignal.timeout(8000),
            cache: "no-store",
            redirect: "error",
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          // Bounded streaming read protects the server from oversized feeds, even without Content-Length.
          const reader = response.body?.getReader();
          if (!reader) throw new Error("Empty response");
          const chunks: Uint8Array[] = [];
          let size = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > 2_000_000) {
              await reader.cancel();
              throw new Error("Feed exceeds 2 MB");
            }
            chunks.push(value);
          }
          const bytes = new Uint8Array(size);
          let offset = 0;
          chunks.forEach((chunk) => {
            bytes.set(chunk, offset);
            offset += chunk.length;
          });
          return parseEventFeed(new TextDecoder().decode(bytes), s);
        } catch (error) {
          warnings.push(
            `${s.id}: ${error instanceof Error ? error.message : "Feed unavailable"}`,
          );
          return [];
        }
      }),
  );
  const curated = seeds
    .map(normalizeEvent)
    .filter((e): e is TravelEvent => e !== null);
  // Authorized updates win over curated records with the same ID.
  return {
    events: [...remote.flat(), ...curated],
    warnings,
    fetchedAt: new Date().toISOString(),
  };
}
