import { HttpError } from "@/lib/hub/security";
import type { PlaceProvider, ProviderId } from "../types";
import { google } from "./google";
import { opentripmap } from "./opentripmap";
import { wikipedia } from "./wikipedia";

/** Registry of interchangeable place sources. Add a provider here to make it selectable. */
export const PROVIDERS: Record<ProviderId, PlaceProvider> = { google, opentripmap, wikipedia };

export function configuredProviders() {
  return Object.values(PROVIDERS).filter((p) => p.configured());
}

/** PLACES_PROVIDER pins the default; otherwise Google → OpenTripMap → Wikipedia. */
export function defaultProvider(): PlaceProvider {
  const pinned = process.env.PLACES_PROVIDER as ProviderId | undefined;
  if (pinned && PROVIDERS[pinned]?.configured()) return PROVIDERS[pinned];
  return configuredProviders()[0] ?? wikipedia;
}

export function provider(id: string): PlaceProvider {
  const p = PROVIDERS[id as ProviderId];
  if (!p) throw new HttpError(400, "Unknown place provider.");
  if (!p.configured()) throw new HttpError(503, `${p.label} is not configured on the server.`);
  return p;
}
