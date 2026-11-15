import { translateCandidates } from "@/lib/hub/translations";
import { catalog, settings } from "@/lib/hub/store";
import {
  discoverOSM,
  discoverGoogle,
  exchangeRates,
  closureScan,
} from "@/lib/hub/discovery";
import { readSnapshot } from "./store";
import { boundedBody } from "./body";
import { createHash } from "node:crypto";
import seedEvents from "@/data/events.json";
import seedPlaces from "@/data/places.json";
import eventSources from "@/data/event-sources.json";
import extraSources from "@/data/update-sources.json";
import {
  normalizeEvent,
  parseEventFeed,
  safeHttps,
  type EventSource,
} from "@/lib/event-core";
import { fetchWeather, weatherConfigured } from "@/lib/weather/provider";
import { weatherAdvice } from "@/lib/weather/advice";
import type { Adapter, SourceKind, SourceResult } from "./types";
export const revision = (data: unknown) =>
  createHash("sha256").update(JSON.stringify(data)).digest("hex");
export function success(
  data: unknown,
  reason: string,
  requests = 0,
): SourceResult {
  return {
    status: "success",
    data,
    reason,
    requests,
    revision: revision(data),
  };
}
export type ExtraSource = {
  id: string;
  kind: Exclude<SourceKind, "weather" | "clothing">;
  label: string;
  url: string;
  enabled: boolean;
  permissionConfirmed: boolean;
  permissionNote: string;
  tokenEnv?: string;
};
export async function readFeed(
  url: string,
  tokenEnv?: string,
  fetcher: typeof fetch = fetch,
) {
  if (!safeHttps(url)) throw new Error("Source requires a reviewed HTTPS URL.");
  const token = tokenEnv ? process.env[tokenEnv] : undefined;
  if (tokenEnv && !token)
    throw new Error("Source authentication is not configured.");
  const response = await fetcher(url, {
    headers: {
      Accept: "application/json, application/rss+xml, application/xml",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
  return boundedBody(response, 2000000);
}
export function adapters(): Adapter[] {
  const weather: Adapter = {
    key: "weather.open-meteo",
    kind: "weather",
    label: "Almaty weather · Open-Meteo",
    load: async () =>
      weatherConfigured()
        ? success(await fetchWeather(), "Fresh forecast received.", 1)
        : {
            status: "not_configured",
            reason:
              "Select evaluation mode or configure a commercial Open-Meteo key.",
            requests: 0,
          },
  };
  const curated: Adapter[] = [
    {
      key: "events.curated",
      kind: "events",
      label: "Owner-approved event listings",
      load: async () =>
        success(
          seedEvents.map(normalizeEvent).filter(Boolean),
          "Approved local data imported; original verification dates are retained.",
        ),
    },
    {
      key: "places.curated",
      kind: "places",
      label: "Owner-approved places",
      load: async () =>
        success(
          await catalog(),
          "Approved local guide imported; this does not re-verify external opening hours or prices.",
        ),
    },
  ];
  const events: Adapter[] = (eventSources as EventSource[])
    .filter(
      (s) => s.enabled && s.permissionConfirmed && s.permissionNote.trim(),
    )
    .map((source) => ({
      key: `events.feed.${source.id}`,
      kind: "events",
      label: source.name,
      load: async () => {
        const body = await readFeed(source.url, source.tokenEnv);
        const parsed = parseEventFeed(body, source);
        if (!parsed.length)
          throw new Error(
            "Event source returned no valid dated records; previous snapshot retained.",
          );
        return success(
          parsed,
          "Event candidates refreshed; publication requires owner approval.",
          1,
        );
      },
    }));
  const external: Adapter[] = (extraSources as ExtraSource[])
    .filter(
      (s) => s.enabled && s.permissionConfirmed && s.permissionNote.trim(),
    )
    .map((source) => ({
      key: `${source.kind}.feed.${source.id}`,
      kind: source.kind,
      label: source.label,
      load: async () => {
        const parsed = JSON.parse(await readFeed(source.url, source.tokenEnv));
        const records = Array.isArray(parsed) ? parsed : parsed.items;
        if (
          !Array.isArray(records) ||
          !records.length ||
          records.length > 500 ||
          !records.every(
            (r) =>
              r &&
              typeof r === "object" &&
              typeof r.id === "string" &&
              r.id.length < 200,
          )
        )
          throw new Error(
            "Source has no valid structured records; previous snapshot retained.",
          );
        return success(
          records,
          "Permitted source refreshed into the review queue.",
          1,
        );
      },
    }));
  for (const kind of [
    "events",
    "places",
    "restaurants",
    "menus",
    "prices",
  ] as const) {
    if (![...events, ...external].some((a) => a.kind === kind))
      curated.push({
        key: `${kind}.external`,
        kind,
        label: `External ${kind} source`,
        load: async () => ({
          status: "not_configured",
          reason:
            "No permitted external source is configured. Approved content is retained.",
          requests: 0,
        }),
      });
  }
  const hub: Adapter[] = [
    {
      key: "places.translations",
      kind: "places",
      label: "AI-assisted Russian drafts",
      load: async () =>
        process.env.TRANSLATION_AI_KEY
          ? success(
              await translateCandidates(),
              "Russian translations saved as pending drafts for owner review.",
              3,
            )
          : {
              status: "not_configured",
              reason:
                "Optional translation provider is not configured; owner translations remain available.",
              requests: 0,
            },
    },
    {
      key: "places.discovery",
      kind: "places",
      label: "OpenStreetMap nearby discovery",
      load: async () => {
        if (!(await settings()).discoveryEnabled)
          return {
            status: "not_configured",
            reason: "Discovery is disabled by the owner.",
            requests: 0,
          };
        return success(
          await discoverOSM(),
          "OSM candidates refreshed for owner review; existing approvals retained.",
          1,
        );
      },
    },
    {
      key: "places.google",
      kind: "places",
      label: "Google Place IDs",
      load: async () =>
        process.env.GOOGLE_PLACES_API_KEY
          ? success(
              await discoverGoogle(),
              "Place IDs discovered; other Google details are fetched live without storage.",
              1,
            )
          : {
              status: "not_configured",
              reason: "Google key absent; OSM discovery is active.",
              requests: 0,
            },
    },
    {
      key: "places.closures",
      kind: "places",
      label: "Weekly OSM closure scan",
      load: async () => {
        const previous = await readSnapshot<{
          lastCheckedAt: string;
          checked: number;
          flagged: number;
        }>("places.closures");
        if (
          previous?.data &&
          Date.now() - new Date(previous.data.lastCheckedAt).valueOf() <
            7 * 86400000
        )
          return success(
            previous.data,
            "Weekly closure scan is not due; previous result retained.",
          );
        return success(
          { ...(await closureScan()), lastCheckedAt: new Date().toISOString() },
          "Confirmed OSM closure tags checked; missing listings are not treated as closed.",
          1,
        );
      },
    },
    {
      key: "restaurants.approved",
      kind: "restaurants",
      label: "Approved restaurants",
      load: async () =>
        success(
          (await catalog()).filter((i) =>
            ["restaurant", "cafe"].includes(i.category),
          ),
          "Approved restaurant records retained; external details need a permitted partner feed.",
        ),
    },
    {
      key: "menus.approved",
      kind: "menus",
      label: "Owner/partner approved menus",
      load: async () =>
        success(
          (await catalog())
            .filter((i) => i.menu.length)
            .map((i) => ({
              id: i.id,
              items: i.menu,
              currency: i.menuCurrency,
              updatedAt: i.menuUpdatedAt,
            })),
          "Approved menus retained with original price dates; no unverified menu price changes.",
        ),
    },
    {
      key: "prices.exchange",
      kind: "prices",
      label: "National Bank of Kazakhstan exchange rates",
      load: async () =>
        success(
          await exchangeRates(),
          "Official exchange rates refreshed for indicative conversions.",
          1,
        ),
    },
  ];
  return [weather, ...curated, ...events, ...external, ...hub];
}
export const clothingAdapter: Pick<Adapter, "key" | "kind" | "label"> = {
  key: "clothing.rules",
  kind: "clothing",
  label: "Weather-based clothing and activity advice",
};
export function clothingResult(
  weather: import("@/lib/weather/types").WeatherData,
) {
  return success(
    weatherAdvice(weather),
    "Rule-based guidance generated from the validated weather snapshot.",
  );
}
