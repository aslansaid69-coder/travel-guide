import { boundedBody } from "@/lib/updates/body";
import type { WeatherData, WeatherDay, WeatherHour } from "./types";
import { localDay } from "./advice";
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Weather provider returned an invalid payload.");
  return value as Record<string, unknown>;
}
function number(value: unknown, min = -1000, max = 10000): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new Error("Weather provider returned missing or invalid values.");
  return value;
}
function arr(value: unknown): unknown[] {
  if (!Array.isArray(value))
    throw new Error("Weather provider returned incomplete forecast arrays.");
  return value;
}
export function parseWeather(raw: unknown, now = new Date()): WeatherData {
  const data = record(raw),
    current = record(data.current),
    hourly = record(data.hourly),
    daily = record(data.daily);
  const times = arr(hourly.time);
  if (times.length < 24 || times.length > 400)
    throw new Error("Weather provider returned an incomplete hourly forecast.");
  const field = (
    r: Record<string, unknown>,
    key: string,
    i: number,
    min = -1000,
    max = 10000,
  ) => number(arr(r[key])[i], min, max);
  const hours: WeatherHour[] = times.map((time, i) => ({
    time: number(time, 0, 9e10),
    temperature: field(hourly, "temperature_2m", i, -100, 65),
    feelsLike: field(hourly, "apparent_temperature", i, -120, 80),
    humidity: field(hourly, "relative_humidity_2m", i, 0, 100),
    rainChance: field(hourly, "precipitation_probability", i, 0, 100),
    precipitation: field(hourly, "precipitation", i, 0, 1000),
    wind: field(hourly, "wind_speed_10m", i, 0, 500),
    gust: field(hourly, "wind_gusts_10m", i, 0, 500),
    uv: field(hourly, "uv_index", i, 0, 40),
    code: field(hourly, "weather_code", i, 0, 99),
    daylight: field(hourly, "is_day", i, 0, 1) === 1,
  }));
  const dayTimes = arr(daily.time);
  if (dayTimes.length !== 7)
    throw new Error("Weather provider did not return seven forecast days.");
  const days: WeatherDay[] = dayTimes.map((time, i) => ({
    date: localDay(number(time, 0, 9e10)),
    min: field(daily, "temperature_2m_min", i, -100, 65),
    max: field(daily, "temperature_2m_max", i, -100, 65),
    code: field(daily, "weather_code", i, 0, 99),
    rainChance: field(daily, "precipitation_probability_max", i, 0, 100),
    precipitation: field(daily, "precipitation_sum", i, 0, 2000),
    wind: field(daily, "wind_speed_10m_max", i, 0, 500),
    gust: field(daily, "wind_gusts_10m_max", i, 0, 500),
    uv: field(daily, "uv_index_max", i, 0, 40),
    sunrise: field(daily, "sunrise", i, 0, 9e10),
    sunset: field(daily, "sunset", i, 0, 9e10),
  }));
  const firstDay = Date.parse(days[0].date + "T00:00:00Z");
  if (
    days.some(
      (d, i) =>
        d.date !==
          new Date(firstDay + i * 86400000).toISOString().slice(0, 10) ||
        d.min > d.max ||
        d.sunrise >= d.sunset,
    ) ||
    hours.some((h, i) => i > 0 && h.time - hours[i - 1].time !== 3600)
  )
    throw new Error(
      "Weather provider returned inconsistent forecast dates or values.",
    );
  const time = number(current.time, 0, 9e10);
  if (Math.abs(now.valueOf() / 1000 - time) > 7200)
    throw new Error("Weather provider returned stale current conditions.");
  if (
    days[0].date !== localDay(now.valueOf() / 1000) ||
    new Set(days.map((d) => d.date)).size !== 7
  )
    throw new Error("Weather forecast dates are not current or distinct.");
  const nearest = hours.reduce((a, b) =>
    Math.abs(a.time - time) < Math.abs(b.time - time) ? a : b,
  );
  return {
    provider: "Open-Meteo",
    attributionUrl: "https://open-meteo.com/",
    fetchedAt: now.toISOString(),
    current: {
      time,
      temperature: number(current.temperature_2m, -100, 65),
      feelsLike: number(current.apparent_temperature, -120, 80),
      humidity: number(current.relative_humidity_2m, 0, 100),
      wind: number(current.wind_speed_10m, 0, 500),
      gust: number(current.wind_gusts_10m, 0, 500),
      precipitation: number(current.precipitation, 0, 1000),
      code: number(current.weather_code, 0, 99),
      daylight: number(current.is_day, 0, 1) === 1,
      rainChance: nearest.rainChance,
      uv: nearest.uv,
    },
    hourly: hours,
    daily: days,
  };
}
export function weatherConfigured() {
  return (
    process.env.WEATHER_MODE === "evaluation" ||
    (process.env.WEATHER_MODE === "commercial" &&
      !!process.env.OPEN_METEO_API_KEY)
  );
}
export async function fetchWeather(fetcher: typeof fetch = fetch) {
  if (!weatherConfigured())
    throw new Error("Weather provider is not configured.");
  const url = new URL(
    process.env.WEATHER_MODE === "commercial"
      ? "https://customer-api.open-meteo.com/v1/forecast"
      : "https://api.open-meteo.com/v1/forecast",
  );
  const fields = {
    latitude: "43.2389",
    longitude: "76.8897",
    timezone: "Asia/Almaty",
    timeformat: "unixtime",
    forecast_days: "7",
    wind_speed_unit: "kmh",
    current:
      "temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,wind_speed_10m,wind_gusts_10m",
    hourly:
      "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,uv_index,is_day",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,sunrise,sunset,uv_index_max",
  };
  for (const [key, value] of Object.entries(fields))
    url.searchParams.set(key, value);
  if (process.env.WEATHER_MODE === "commercial")
    url.searchParams.set("apikey", process.env.OPEN_METEO_API_KEY!);
  try {
    const r = await fetcher(url, {
      signal: AbortSignal.timeout(12000),
      cache: "no-store",
      redirect: "error",
    });
    if (!r.ok) throw new Error(`Weather provider returned HTTP ${r.status}.`);
    const text = await boundedBody(r, 500000);
    return parseWeather(JSON.parse(text));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Weather"))
      throw error;
    throw new Error("Weather provider is temporarily unavailable.");
  }
}
