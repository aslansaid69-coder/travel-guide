import { database } from "@/lib/db";
import { boundedBody } from "@/lib/updates/body";
import { catalog } from "./store";
import { hash, HttpError } from "./security";
import { km } from "./core";
export type RouteResult = {
  estimated: boolean;
  source: string;
  /** [lng, lat] pairs along the route. */
  coordinates: number[][];
  legs: { distance: number; duration: number }[];
};
export async function routeFor(ids: string[]): Promise<RouteResult> {
  const items = await catalog(),
    stops = ids.map((id) => items.find((i) => i.id === id));
  if (stops.some((i) => !i))
    throw new HttpError(400, "Use approved catalog stops for routing.");
  const places = stops.filter((i): i is NonNullable<typeof i> => !!i);
  const fallback: RouteResult = {
    estimated: true,
    source:
      "Straight-line distance × 1.35 at 25 km/h; allow for traffic and mountain roads.",
    coordinates: places.map((p) => [p.lng, p.lat]),
    legs: places
      .slice(1)
      .map((p, i) => ({
        distance: km(places[i], p) * 1.35,
        duration: Math.ceil(((km(places[i], p) * 1.35) / 25) * 60) + 10,
      })),
  };
  if (places.length < 2 || !process.env.ORS_API_KEY) return fallback;
  const sql = database(),
    key = hash(JSON.stringify(places.map((i) => [i.lat, i.lng])));
  const cache =
    await sql`SELECT data FROM hub_route_cache WHERE id=${key} AND expires_at>now()`;
  if (cache[0]) return cache[0].data as RouteResult;
  try {
    await sql`INSERT INTO hub_provider_usage(provider,requests) VALUES('openrouteservice',1) ON CONFLICT(provider,day) DO UPDATE SET requests=hub_provider_usage.requests+1`;
    const r = await fetch(
      "https://api.openrouteservice.org/v2/directions/driving-car/geojson",
      {
        method: "POST",
        headers: {
          Authorization: process.env.ORS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          coordinates: places.map((p) => [p.lng, p.lat]),
          instructions: false,
        }),
        signal: AbortSignal.timeout(10000),
        cache: "no-store",
      },
    );
    if (!r.ok) throw new Error("Route unavailable");
    const d = JSON.parse(await boundedBody(r, 1500000));
    const f = d.features?.[0];
    if (
      !Array.isArray(f?.geometry?.coordinates) ||
      !Array.isArray(f?.properties?.segments)
    )
      throw new Error("Route invalid");
    const result: RouteResult = {
      estimated: false,
      source:
        "© openrouteservice.org by HeiGIT | © OpenStreetMap contributors. Driving estimates vary with traffic.",
      coordinates: f.geometry.coordinates,
      legs: f.properties.segments.map(
        (s: { distance: number; duration: number }) => ({
          distance: s.distance / 1000,
          duration: Math.ceil(s.duration / 60),
        }),
      ),
    };
    await sql`INSERT INTO hub_route_cache(id,data,expires_at) VALUES(${key},${JSON.stringify(result)}::jsonb,now()+interval '24 hours') ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,expires_at=EXCLUDED.expires_at`;
    return result;
  } catch {
    return fallback;
  }
}
