import type {
  CatalogItem,
  Plan,
  Price,
  HubSettings,
  Rates,
  Stop,
} from "./types";
export const centre = { lat: 43.2389, lng: 76.8897 };
export function km(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const rad = Math.PI / 180,
    dlat = (b.lat - a.lat) * rad,
    dlng = (b.lng - a.lng) * rad;
  return (
    6371 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(dlat / 2) ** 2 +
            Math.cos(a.lat * rad) *
              Math.cos(b.lat * rad) *
              Math.sin(dlng / 2) ** 2,
        ),
      ),
    )
  );
}
export const minutes = (v: string) =>
  Number(v.slice(0, 2)) * 60 + Number(v.slice(3));
export const time = (n: number) =>
  `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(Math.round(n) % 60).padStart(2, "0")}`;
export function dayDate(start: string, index: number) {
  const d = new Date(start + "T12:00:00+05:00");
  d.setUTCDate(d.getUTCDate() + index);
  return d.toISOString().slice(0, 10);
}
export function maps(item: CatalogItem, directions = false) {
  const p = new URLSearchParams({
    api: "1",
    ...(directions
      ? {
          destination: item.name,
          ...(item.googlePlaceId
            ? { destination_place_id: item.googlePlaceId }
            : {}),
        }
      : {
          query: `${item.name} ${item.lat},${item.lng}`,
          ...(item.googlePlaceId ? { query_place_id: item.googlePlaceId } : {}),
        }),
  });
  return `https://www.google.com/maps/${directions ? "dir/" : "search/"}?${p}`;
}
export function isOpen(
  item: CatalogItem,
  date: string,
  start: string,
  duration = 0,
): boolean | null {
  if (item.closed) return false;
  const weekday = String(new Date(date + "T12:00:00+05:00").getUTCDay());
  const windows = item.schedule[weekday];
  if (!windows) return null;
  const m = minutes(start);
  return windows.some(
    ([a, b]) =>
      m >= minutes(a) && m + duration <= (b === "00:00" ? 1440 : minutes(b)),
  );
}
export function openNow(item: CatalogItem, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (key: string) => parts.find((p) => p.type === key)?.value || "";
  return isOpen(
    item,
    `${get("year")}-${get("month")}-${get("day")}`,
    `${get("hour")}:${get("minute")}`,
  );
}
export function mealPrice(item: CatalogItem): Price | null {
  if (!item.menu.length) return item.price;
  const prices = item.menu.map((m) => m.price).filter((p) => p > 0);
  if (!prices.length) return item.price;
  const mean = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
  return {
    type: "per-person",
    min: mean,
    max: mean * 2,
    currency: item.menuCurrency,
    source: "estimated",
    updatedAt: item.menuUpdatedAt,
    note: "Estimated one to two menu items per guest; drinks and extras may vary.",
  };
}
export type PriceLine = {
  id: string;
  day: number;
  name: string;
  min: number;
  max: number;
  confirmed: boolean;
  unknown: boolean;
  note: string;
};
export function estimate(
  plan: Plan,
  items: CatalogItem[],
  settings: HubSettings,
  rates: Rates | null,
) {
  const lines: PriceLine[] = [];
  const guests = plan.adults + plan.children;
  const convert = (n: number, c: string) =>
    c === "KZT" ? n : rates?.rates[c] ? n / rates.rates[c] : null;
  plan.days.forEach((day, index) => {
    day.stops.forEach((stop) => {
      const item = items.find((i) => i.id === stop.itemId);
      const p =
        item &&
        (item.category === "restaurant" || item.category === "cafe"
          ? mealPrice(item)
          : item.price);
      let min: number | null = null,
        max: number | null = null;
      if (p) {
        const adult =
            p.type === "per-person" || p.type === "range" ? plan.adults : 1,
          children =
            p.type === "per-person" || p.type === "range" ? plan.children : 0;
        min = convert(
          p.min * adult + (p.child ?? p.min) * children,
          p.currency,
        );
        max = convert(
          p.max * adult + (p.child ?? p.max) * children,
          p.currency,
        );
      }
      const season = settings.seasonal
        .filter(
          (s) =>
            dayDate(plan.startDate, index) >= s.from &&
            dayDate(plan.startDate, index) <= s.to,
        )
        .reduce((v, s) => v * (1 + s.percent / 100), 1);
      const factor =
        (1 + settings.markup / 100) *
        (guests >= settings.groupThreshold
          ? 1 - settings.groupDiscount / 100
          : 1) *
        season;
      lines.push({
        id: stop.id,
        day: index,
        name: item?.name || "Unavailable place",
        min: Math.round((min ?? 0) * factor),
        max: Math.round((max ?? 0) * factor),
        confirmed:
          !!p && p.source === "owner-confirmed" && p.currency === "KZT",
        unknown: min === null || max === null,
        note: p?.note || "Price needs confirmation by our team.",
      });
    });
    let distance = 0;
    const first = items.find((i) => i.id === day.stops[0]?.itemId),
      last = items.find((i) => i.id === day.stops.at(-1)?.itemId);
    if (first) distance += km(centre, first) * 1.35;
    if (last) distance += km(last, centre) * 1.35;
    for (let k = 1; k < day.stops.length; k++) {
      const a = items.find((i) => i.id === day.stops[k - 1].itemId),
        b = items.find((i) => i.id === day.stops[k].itemId);
      if (a && b) distance += km(a, b) * 1.35;
    }
    if (distance) {
      const n = Math.ceil(
        (settings.transportBase + settings.transportPerKm * distance) *
          Math.ceil(guests / settings.vehicleCapacity),
      );
      lines.push({
        id: `transport-${index}`,
        day: index,
        name: "Transport · approximate distance",
        min: n,
        max: Math.ceil(n * 1.3),
        confirmed: false,
        unknown: !n,
        note: "Road distance and traffic may differ. Fixed owner rates are applied per vehicle.",
      });
    }
  });
  const min = lines.reduce((a, l) => a + l.min, 0),
    max = lines.reduce((a, l) => a + l.max, 0);
  const rate =
    plan.currency === "KZT" ? 1 : rates?.rates[plan.currency] || null;
  return {
    lines,
    min,
    max,
    perPerson: { min: Math.round(min / guests), max: Math.round(max / guests) },
    days: plan.days.map((_, i) => ({
      min: lines.filter((l) => l.day === i).reduce((a, l) => a + l.min, 0),
      max: lines.filter((l) => l.day === i).reduce((a, l) => a + l.max, 0),
    })),
    unknown: lines.filter((l) => l.unknown).length,
    displayRate: rate,
    currency: plan.currency,
    ratesDate: rates?.date || null,
  };
}
export type Conflict = {
  stopId: string;
  kind: string;
  message: string;
  fix: string;
};
export function conflicts(
  plan: Plan,
  items: CatalogItem[],
  weather?: {
    daily: {
      date: string;
      rainChance: number;
      code: number;
      max: number;
      min: number;
    }[];
  } | null,
) {
  const result: Conflict[] = [];
  plan.days.forEach((d, index) => {
    const date = dayDate(plan.startDate, index);
    d.stops.forEach((stop, k) => {
      const item = items.find((i) => i.id === stop.itemId);
      if (!item || item.status !== "approved" || item.closed) {
        result.push({
          stopId: stop.id,
          kind: "closed",
          message: "This place is unavailable.",
          fix: "Replace it with an approved alternative.",
        });
        return;
      }
      const open = isOpen(item, date, stop.start, stop.duration);
      if (open === false)
        result.push({
          stopId: stop.id,
          kind: "hours",
          message: "Closed during the planned visit.",
          fix: "Change the start time or choose another place.",
        });
      if (open === null)
        result.push({
          stopId: stop.id,
          kind: "unverified",
          message: "Opening hours need confirmation.",
          fix: "Check visitor information before travelling.",
        });
      if (minutes(stop.start) + stop.duration > 1440)
        result.push({
          stopId: stop.id,
          kind: "overlap",
          message: "This visit continues into the next day.",
          fix: "Choose an earlier start time.",
        });
      const prev = d.stops[k - 1];
      if (prev) {
        const p = items.find((i) => i.id === prev.itemId);
        if (p) {
          const travel = Math.ceil(((km(p, item) * 1.35) / 25) * 60) + 10;
          const earliest = minutes(prev.start) + prev.duration + travel;
          if (minutes(stop.start) < earliest)
            result.push({
              stopId: stop.id,
              kind: "travel",
              message: `Allow about ${travel} min travel from the previous stop (estimate).`,
              fix: `Start around ${time(earliest)}, or move this stop to another day.`,
            });
          if (km(p, item) > 60)
            result.push({
              stopId: stop.id,
              kind: "distance",
              message: "This is a long journey between stops.",
              fix: "Give this destination its own day.",
            });
        }
      }
      const forecast = weather?.daily.find((w) => w.date === date);
      if (
        item.outdoor &&
        forecast &&
        (forecast.rainChance >= 65 ||
          forecast.code >= 95 ||
          forecast.max >= 35 ||
          forecast.min <= -15)
      )
        result.push({
          stopId: stop.id,
          kind: "weather",
          message: "Weather may make this outdoor visit unsuitable.",
          fix: "Suggest an indoor replacement or a free reschedule request.",
        });
    });
  });
  return result;
}
export function generatePlan(
  plan: Plan,
  items: CatalogItem[],
  weather?: Parameters<typeof conflicts>[2],
) {
  const used = new Set<string>();
  return {
    ...plan,
    days: plan.days.map((_, index) => {
      const date = dayDate(plan.startDate, index),
        forecast = weather?.daily.find((d) => d.date === date),
        bad =
          !!forecast &&
          (forecast.rainChance >= 65 ||
            forecast.code >= 95 ||
            forecast.max >= 35 ||
            forecast.min <= -15);
      const candidates = items
        .filter(
          (i) =>
            i.status === "approved" &&
            !i.closed &&
            !used.has(i.id) &&
            (!bad || !i.outdoor),
        )
        .sort((a, b) => {
          const score = (i: CatalogItem) =>
            (plan.interests.includes(i.category) ? 100 : 0) -
            (plan.budget === "easy" ? (i.price?.min || 0) / 100 : 0) -
            km(centre, i) +
            i.sort;
          return score(b) - score(a);
        });
      let at = 9 * 60,
        previous: CatalogItem | null = null;
      const stops: Stop[] = [];
      for (const i of candidates) {
        if (stops.length >= 3) break;
        if (previous && km(previous, i) > 55) continue;
        if (km(centre, i) > 70 && stops.length) continue;
        const travel = previous
          ? Math.ceil(((km(previous, i) * 1.35) / 25) * 60) + 15
          : 0;
        let start = at + travel;
        if (isOpen(i, date, time(start), i.duration) === false) {
          const windows =
            i.schedule[String(new Date(date + "T12:00:00+05:00").getUTCDay())];
          const opening = windows?.find(
            ([a, b]) => minutes(b) - Math.max(start, minutes(a)) >= i.duration,
          );
          if (!opening) continue;
          start = Math.max(start, minutes(opening[0]));
        }
        if (start + i.duration > 19 * 60) continue;
        stops.push({
          id: `auto-${index}-${i.id}`,
          itemId: i.id,
          start: time(start),
          duration: i.duration,
          note: "",
        });
        used.add(i.id);
        at = start + i.duration;
        previous = i;
        if (km(centre, i) > 70) break;
      }
      return { stops };
    }),
  };
}
export const money = (minor: number, currency = "KZT") =>
  new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KZT" ? 0 : 2,
  }).format(minor / 100);
