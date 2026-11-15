import { readSnapshot } from "@/lib/updates/store";
import type { WeatherData } from "./types";
import { weatherAdvice, localDay } from "./advice";
export async function getWeather() {
  const snapshot = await readSnapshot<WeatherData>("weather.open-meteo");
  if (!snapshot?.data)
    return {
      weather: null,
      advice: null,
      lastUpdated: null,
      stale: true,
      status: snapshot?.status || "not_configured",
    };
  const now = new Date();
  const weather = snapshot.data;
  return {
    weather,
    advice: weatherAdvice(weather, now),
    lastUpdated: snapshot.lastSuccess,
    stale:
      snapshot.status !== "success" ||
      now.valueOf() / 1000 - weather.current.time > 7200 ||
      weather.daily[0].date !== localDay(now.valueOf() / 1000),
    status: snapshot.status,
  };
}
