import type { PricingSettings } from "./settings";

/**
 * Tour price estimate. Pure and deterministic: everything it needs is passed in,
 * so the server, the assistant and tests all share exactly one calculation.
 * Money is integer minor units. Results are ranges ("≈ from X to Y"), never a promise.
 */
export type EstimatePlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** Typical visit length in minutes. */
  durationMin: number;
  /** null = price unknown / not found (excluded from the total and listed separately). */
  ticket: {
    minMinor: number;
    maxMinor: number;
    childMinor?: number;
    currency: string;
    /** false = one price for the whole group (fixed / per-group tariffs). Default true. */
    perPerson?: boolean;
  } | null;
};
export type EstimateGuide =
  | { kind: "selected"; id: string; name: string; dayRateMinor: number }
  | { kind: "market"; minDayMinor: number; maxDayMinor: number; averageDayMinor: number; count: number };
export type EstimateInput = {
  places: EstimatePlace[];
  adults: number;
  children: number;
  guide: EstimateGuide | null;
  /** Optional road legs from a router (km/min). Must have places.length + 1 entries (start → … → start). */
  legs?: { km: number; minutes: number }[];
};
export type Range = { min: number; max: number };
export type EstimateLine = {
  key: "tickets" | "transport" | "guide" | "commission";
  label: string;
  min: number;
  max: number;
  detail: string;
};
export type Estimate = {
  currency: string;
  people: number;
  days: number;
  distanceKm: number;
  driveMinutes: number;
  visitMinutes: number;
  vehicles: number;
  lines: EstimateLine[];
  subtotal: Range;
  total: Range;
  depositMinor: number;
  unpricedPlaces: string[];
  /** Places whose ticket currency differs from the tariff currency (excluded, listed). */
  currencyMismatch: string[];
  route: { from: string; to: string; km: number; minutes: number }[];
  disclaimer: string;
};

const R = 6371;
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Start → places in order → start, using straight-line × road factor and an average speed. */
export function straightLineLegs(
  start: { lat: number; lng: number },
  places: { lat: number; lng: number }[],
  s: Pick<PricingSettings, "roadFactor" | "averageSpeedKmh">,
) {
  const stops = [start, ...places, start];
  return stops.slice(1).map((p, i) => {
    const km = haversineKm(stops[i], p) * s.roadFactor;
    return { km, minutes: (km / s.averageSpeedKmh) * 60 };
  });
}

export const DISCLAIMER =
  "Approximate price. The final amount may differ: entrance fees, traffic and on-the-day choices can change it.";

export class EstimateError extends Error {}

export function estimateTour(input: EstimateInput, s: PricingSettings): Estimate {
  const { places } = input;
  if (!places.length) throw new EstimateError("Choose at least one place.");
  if (places.length > s.maxPlaces) throw new EstimateError(`Choose at most ${s.maxPlaces} places.`);
  if (new Set(places.map((p) => p.id)).size !== places.length)
    throw new EstimateError("Each place can be added only once.");
  const adults = Math.trunc(input.adults);
  const children = Math.trunc(input.children);
  if (!(adults >= 1 && adults <= 40) || !(children >= 0 && children <= 40))
    throw new EstimateError("Travellers: 1–40 adults and 0–40 children.");
  const people = adults + children;

  const start = { lat: s.startLat, lng: s.startLng };
  const legs = input.legs?.length === places.length + 1 ? input.legs : straightLineLegs(start, places, s);
  const distanceKm = legs.reduce((a, l) => a + l.km, 0);
  const driveMinutes = legs.reduce((a, l) => a + l.minutes, 0);
  const visitMinutes = places.reduce((a, p) => a + Math.max(0, p.durationMin), 0);
  const days = Math.max(1, Math.ceil((driveMinutes + visitMinutes) / (s.hoursPerDay * 60)));
  const names = ["Start", ...places.map((p) => p.name), "Start"];
  const route = legs.map((l, i) => ({
    from: i === 0 ? s.startLabel : names[i],
    to: i === legs.length - 1 ? s.startLabel : names[i + 1],
    km: Math.round(l.km * 10) / 10,
    minutes: Math.round(l.minutes),
  }));

  // 1. Entrance tickets × travellers.
  const unpricedPlaces: string[] = [];
  const currencyMismatch: string[] = [];
  let ticketMin = 0;
  let ticketMax = 0;
  for (const p of places) {
    if (!p.ticket) {
      unpricedPlaces.push(p.name);
      continue;
    }
    if (p.ticket.currency !== s.currency) {
      currencyMismatch.push(p.name);
      continue;
    }
    if (p.ticket.perPerson === false) {
      ticketMin += p.ticket.minMinor;
      ticketMax += p.ticket.maxMinor;
      continue;
    }
    const child = (adultPrice: number) =>
      p.ticket?.childMinor ?? Math.round((adultPrice * s.childTicketPercent) / 100);
    ticketMin += p.ticket.minMinor * adults + child(p.ticket.minMinor) * children;
    ticketMax += p.ticket.maxMinor * adults + child(p.ticket.maxMinor) * children;
  }

  // 2. Transport: distance × tariff per vehicle, at least the daily minimum; buffer for the upper bound.
  const vehicles = Math.ceil(people / s.vehicleCapacity);
  const transportBase = Math.max(distanceKm * s.transportPerKmMinor, s.transportMinPerDayMinor * days) * vehicles;
  const transportMin = Math.round(transportBase);
  const transportMax = Math.round(transportBase * (1 + s.transportBufferPercent / 100));

  // 3. Guide: chosen guide's day rate, otherwise the range of active guides (or the fallback rate).
  let guideMin: number;
  let guideMax: number;
  let guideDetail: string;
  if (input.guide?.kind === "selected") {
    guideMin = guideMax = input.guide.dayRateMinor * days;
    guideDetail = `${input.guide.name}: ${days} day${days > 1 ? "s" : ""} × day rate`;
  } else if (input.guide?.kind === "market" && input.guide.count > 0) {
    guideMin = input.guide.minDayMinor * days;
    guideMax = input.guide.maxDayMinor * days;
    guideDetail = `${days} day${days > 1 ? "s" : ""} × day rate of available guides (average ${Math.round(input.guide.averageDayMinor / 100)})`;
  } else {
    guideMin = guideMax = s.fallbackGuideDayMinor * days;
    guideDetail = `${days} day${days > 1 ? "s" : ""} × typical guide day rate`;
  }

  // 4. Service commission on everything above.
  const subtotal = { min: ticketMin + transportMin + guideMin, max: ticketMax + transportMax + guideMax };
  const commission = {
    min: Math.round((subtotal.min * s.commissionPercent) / 100),
    max: Math.round((subtotal.max * s.commissionPercent) / 100),
  };
  const total = { min: subtotal.min + commission.min, max: subtotal.max + commission.max };

  const lines: EstimateLine[] = [
    {
      key: "tickets",
      label: "Entrance tickets",
      min: ticketMin,
      max: ticketMax,
      detail:
        `${places.length - unpricedPlaces.length - currencyMismatch.length} of ${places.length} places priced × ${adults} adult${adults > 1 ? "s" : ""}` +
        (children ? ` + ${children} child${children > 1 ? "ren" : ""}` : ""),
    },
    {
      key: "transport",
      label: "Transport",
      min: transportMin,
      max: transportMax,
      detail: `${Math.round(distanceKm)} km × tariff × ${vehicles} vehicle${vehicles > 1 ? "s" : ""}${
        transportBase > distanceKm * s.transportPerKmMinor * vehicles ? " (daily minimum)" : ""
      }`,
    },
    { key: "guide", label: "Guide", min: guideMin, max: guideMax, detail: guideDetail },
    {
      key: "commission",
      label: "Service fee",
      min: commission.min,
      max: commission.max,
      detail: `${s.commissionPercent}% of tickets, transport and guide`,
    },
  ];
  return {
    currency: s.currency,
    people,
    days,
    distanceKm: Math.round(distanceKm * 10) / 10,
    driveMinutes: Math.round(driveMinutes),
    visitMinutes,
    vehicles,
    lines,
    subtotal,
    total,
    depositMinor: Math.ceil((total.max * s.depositPercent) / 100),
    unpricedPlaces,
    currencyMismatch,
    route,
    disclaimer: DISCLAIMER,
  };
}
