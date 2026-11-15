import type { WeatherAdvice, WeatherData, WeatherHour } from "./types";
export const localDay = (time: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(time * 1000));
export function condition(code: number) {
  if (code === 0) return "Clear sky";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorms";
}
function risky(h: WeatherHour) {
  return (
    h.code >= 95 ||
    h.wind >= 50 ||
    h.gust >= 70 ||
    h.temperature <= -15 ||
    h.temperature >= 35 ||
    h.precipitation >= 8
  );
}
export function weatherAdvice(
  weather: WeatherData,
  now = new Date(),
): WeatherAdvice {
  const date = localDay(now.valueOf() / 1000),
    today = weather.daily.find((d) => d.date === date);
  const hours = weather.hourly.filter(
    (h) => localDay(h.time) === date && h.time >= now.valueOf() / 1000 - 3600,
  );
  if (!today)
    return {
      date,
      clothing: [],
      cautions: [
        "This forecast no longer covers today. Check a fresh forecast before planning.",
      ],
      outdoorWindow: null,
      outdoorHint: "Fresh guidance is temporarily unavailable.",
    };
  const daylight = hours.filter((h) => h.daylight);
  const cold = Math.min(today.min, ...daylight.map((h) => h.feelsLike));
  const warm = Math.max(today.max, ...daylight.map((h) => h.temperature));
  const rain = Math.max(today.rainChance, ...hours.map((h) => h.rainChance));
  const wind = Math.max(today.wind, ...hours.map((h) => h.wind));
  const snow = hours.some((h) =>
    [71, 73, 75, 77, 85, 86, 56, 57, 66, 67].includes(h.code),
  );
  const clothing: string[] =
    cold < 0
      ? ["Wear a warm insulated coat, thermal layers, a hat, and gloves."]
      : cold < 12
        ? ["Bring a warm outer layer over a light base layer."]
        : cold < 20
          ? ["Wear light layers and carry a jacket for cooler hours."]
          : ["Choose light, breathable clothing."];
  clothing.push(
    snow
      ? "Choose warm, grippy footwear; snow or ice may make paths slippery."
      : rain >= 40
        ? "Wear water-resistant shoes with good grip."
        : "Comfortable walking shoes will suit city sightseeing.",
  );
  if (rain >= 40 || today.precipitation >= 1)
    clothing.push("Pack a waterproof shell; rain or snow is possible.");
  if (wind >= 25) clothing.push("Add a windproof outer layer.");
  if (today.uv >= 3)
    clothing.push(
      "Bring sun protection, sunglasses, and a brimmed hat, especially around midday.",
    );
  if (weather.current.humidity >= 80 && cold < 12)
    clothing.push("Damp air can feel chilly; keep an extra dry layer handy.");
  if (weather.current.humidity <= 30 || warm >= 28)
    clothing.push("Carry drinking water for outdoor time.");
  const cautions: string[] = [];
  if (hours.some((h) => h.code >= 95))
    cautions.push(
      "Thunderstorms are forecast. Avoid exposed trails and check local advisories.",
    );
  if (hours.some((h) => h.wind >= 50 || h.gust >= 70) || today.gust >= 70)
    cautions.push("Strong wind or gusts may disrupt exposed walks and lifts.");
  if (cold <= -15)
    cautions.push(
      "Very cold conditions are forecast. Shorten outdoor stops and check local advice.",
    );
  if (warm >= 35)
    cautions.push(
      "Very hot conditions are forecast. Avoid strenuous activity in the hottest hours.",
    );
  if (hours.some((h) => h.precipitation >= 8))
    cautions.push("Heavy precipitation may affect paths and roads.");
  if (snow)
    cautions.push("Snow or freezing precipitation may make paths slippery.");
  if (today.uv >= 8)
    cautions.push("Very high UV is forecast; plan shade breaks around midday.");
  const candidates = daylight.filter(
    (h) =>
      h.time >= now.valueOf() / 1000 &&
      h.rainChance < 50 &&
      h.precipitation < 1 &&
      !risky(h),
  );
  let best: { start: number; end: number; score: number } | null = null;
  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i],
      b = candidates[i + 1];
    if (!b || b.time - a.time !== 3600) continue;
    const score = [a, b].reduce(
      (s, h) =>
        s +
        Math.abs(h.feelsLike - 20) +
        h.rainChance * 0.4 +
        h.wind * 0.3 +
        Math.max(0, h.uv - 5) * 3,
      0,
    );
    if (!best || score < best.score)
      best = { start: a.time, end: b.time + 3600, score };
  }
  return {
    date,
    clothing,
    cautions,
    outdoorWindow: best ? { start: best.start, end: best.end } : null,
    outdoorHint: best
      ? "A more comfortable forecast window for a city walk. Mountain conditions can differ."
      : "No two-hour daylight window meets our planning thresholds for the rest of today. Consider an indoor stop and check the latest forecast.",
  };
}
