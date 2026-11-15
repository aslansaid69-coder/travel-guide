"use client";
import { T, useT, useLanguage } from "@/components/hub/language";
import { useEffect, useState } from "react";
import {
  CloudSun,
  Sun,
  CloudRain,
  Snowflake,
  Wind,
  Droplets,
  Sunrise,
  Sunset,
  Shirt,
  ArrowUpRight,
  AlertTriangle,
} from "lucide-react";
import type { WeatherData, WeatherAdvice } from "@/lib/weather/types";
import { condition, localDay } from "@/lib/weather/advice";
type WeatherView = {
  weather: WeatherData | null;
  advice: WeatherAdvice | null;
  lastUpdated: string | null;
  stale: boolean;
  status: string;
};
const clock = (time: number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Almaty",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time * 1000));
const stamp = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Almaty",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
function Icon({ code, size = 20 }: { code: number; size?: number }) {
  const Component =
    code === 0
      ? Sun
      : (code >= 71 && code <= 77) || code === 85 || code === 86
        ? Snowflake
        : code >= 51
          ? CloudRain
          : CloudSun;
  return <Component size={size} strokeWidth={1.5} aria-hidden="true" />;
}
export function WeatherPanel() {
  const t = useT();
  const { lang } = useLanguage();
  const [view, setView] = useState<WeatherView | null>(null),
    [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let disposed = false;
    async function refresh() {
      try {
        const r = await fetch("/api/weather");
        if (!r.ok) throw new Error("Unavailable");
        const data = await r.json();
        if (!disposed) setView(data);
      } catch {
        if (!disposed)
          setView((previous) =>
            previous ? { ...previous, stale: true } : null,
          );
      } finally {
        if (!disposed) setLoaded(true);
      }
    }
    void refresh();
    const timer = setInterval(refresh, 15 * 60 * 1000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  const weather = view?.weather,
    advice = view?.advice;
  const today = localDay(Date.now() / 1000),
    days = weather?.daily.filter((d) => d.date >= today) || [],
    day = days.find((d) => d.date === today);
  return (
    <aside className="weather-panel" aria-labelledby="weather-title">
      <div className="weather-panel-heading">
        <p className="eyebrow">PLAN A LITTLE, EXPLORE A LOT</p>
        <h3 id="weather-title">
          <T>Almaty, today.</T>
        </h3>
      </div>
      {!weather ? (
        <div className="weather-empty" role="status">
          <CloudSun size={36} strokeWidth={1} />
          <p>
            {loaded
              ? "The forecast is taking a short break."
              : "Bringing you the forecast…"}
          </p>
          <small>
            {loaded
              ? "Check a current forecast before heading into the mountains."
              : "Current conditions, seven days, and a little packing advice."}
          </small>
        </div>
      ) : (
        <>
          {view?.stale && (
            <p className="weather-stale" role="status">
              Showing the last available forecast. Check fresh conditions before
              heading out.
            </p>
          )}
          <div className="weather-current">
            <div>
              <span className="weather-temperature">
                {Math.round(weather.current.temperature)}°
              </span>
              <span className="weather-unit">C</span>
              <p>{t(condition(weather.current.code))}</p>
            </div>
            <Icon code={weather.current.code} size={48} />
          </div>
          <p className="weather-observed">
            Conditions as of {clock(weather.current.time)} · Almaty city centre
          </p>
          <div className="weather-metrics">
            <span>
              Feels like
              <strong>{Math.round(weather.current.feelsLike)}°</strong>
            </span>
            <span>
              <Wind size={13} />
              Wind<strong>{Math.round(weather.current.wind)} km/h</strong>
            </span>
            <span>
              <Droplets size={13} />
              Humidity<strong>{Math.round(weather.current.humidity)}%</strong>
            </span>
          </div>
          <div className="weather-small-metrics">
            <span>Rain chance {Math.round(weather.current.rainChance)}%</span>
            <span>UV {weather.current.uv.toFixed(1)}</span>
          </div>
          {advice?.cautions.length ? (
            <div className="weather-cautions">
              <p>
                <AlertTriangle size={15} />
                <T>Planning cautions</T>
              </p>
              <ul>
                {advice.cautions.map((text) => (
                  <li key={text}>{t(text)}</li>
                ))}
              </ul>
              <small>
                Forecast-based guide thresholds, not official weather warnings.
              </small>
            </div>
          ) : null}
          <div className="weather-week">
            <h4>
              <T>The next seven days</T>
            </h4>
            {days.length ? (
              days.map((d) => (
                <div key={d.date} className="weather-day">
                  <span>
                    {d.date === today
                      ? t("Today")
                      : new Intl.DateTimeFormat(lang, {
                          timeZone: "Asia/Almaty",
                          weekday: "short",
                        }).format(new Date(d.date + "T12:00:00+05:00"))}
                  </span>
                  <Icon code={d.code} size={17} />
                  <span className="weather-day-rain">
                    {Math.round(d.rainChance)}%
                  </span>
                  <span>
                    {Math.round(d.min)}° <strong>{Math.round(d.max)}°</strong>
                  </span>
                  <span className="sr-only">
                    {condition(d.code)}, rain chance {d.rainChance} percent
                  </span>
                </div>
              ))
            ) : (
              <p>The saved forecast no longer covers today.</p>
            )}
          </div>
          {day && (
            <div className="weather-sun">
              <span>
                <Sunrise size={15} />
                {clock(day.sunrise)}
              </span>
              <span>
                <Sunset size={15} />
                {clock(day.sunset)}
              </span>
            </div>
          )}
          <details className="weather-clothing" open>
            <summary>
              <Shirt size={18} />
              What to wear today<span>+</span>
            </summary>
            {advice?.clothing.length ? (
              <ul>
                {advice.clothing.map((text) => (
                  <li key={text}>{t(text)}</li>
                ))}
              </ul>
            ) : (
              <p>Fresh clothing advice is unavailable.</p>
            )}
          </details>
          {advice && (
            <div className="weather-outdoor">
              <h4>
                <T>Your outdoor window</T>
              </h4>
              {advice.outdoorWindow && (
                <p className="weather-window">
                  {clock(advice.outdoorWindow.start)}–
                  {clock(advice.outdoorWindow.end)}
                </p>
              )}
              <p>{t(advice.outdoorHint)}</p>
            </div>
          )}
          <p className="weather-credit">
            {view?.lastUpdated && (
              <>
                Last refreshed {stamp(view.lastUpdated)} · UTC+5
                <br />
              </>
            )}
            Forecast:{" "}
            <a
              href={weather.attributionUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open-Meteo
              <ArrowUpRight size={11} />
            </a>
            . Mountains can be colder, windier, and less predictable.
          </p>
        </>
      )}
    </aside>
  );
}
