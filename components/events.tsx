"use client";
import { T, useLanguage, useT } from "@/components/hub/language";
import Image from "next/image";
import site from "@/data/site.json";
import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays, MapPin } from "lucide-react";
import type { TravelEvent } from "@/lib/event-core";
import { visibleEvents } from "@/lib/event-view";
export function Events({ initialEvents }: { initialEvents: TravelEvent[] }) {
  const t = useT();
  const { lang } = useLanguage();
  const [events, setEvents] = useState(initialEvents),
    [filter, setFilter] = useState("All events");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [retained, setRetained] = useState(false);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      try {
        const r = await fetch("/api/events");
        if (!r.ok) return;
        const data = await r.json();
        if (!disposed && Array.isArray(data.events)) {
          setEvents(data.events);
          setLastUpdated(data.fetchedAt);
          setRetained(data.sourceStatus !== "ok");
        }
      } catch {
        /* Keep the verified server snapshot offline. */
      }
    };
    void refresh();
    const timer = setInterval(refresh, 60 * 60 * 1000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);
  const current = visibleEvents(events),
    filtered = current.filter(
      (e) => filter === "All events" || e.category === filter,
    );
  return (
    <section id="events" className="section events-section">
      <div className="shell">
        <div className="section-top">
          <div>
            <p className="eyebrow">GET INTO THE LOCAL RHYTHM</p>
            <h2>
              <T ru="Хорошие дни.">Good days.</T>{" "}
              <em>
                <T ru="Большие планы.">Great plans.</T>
              </em>
            </h2>
          </div>
          <span className="section-note">
            <CalendarDays size={15} /> Last 30 days & coming up
          </span>
        </div>
        <p className="source-updated">
          {lastUpdated
            ? `Approved listings refreshed ${new Intl.DateTimeFormat(lang === "ru" ? "ru" : "en-GB", { timeZone: "Asia/Almaty", dateStyle: "medium", timeStyle: "short" }).format(new Date(lastUpdated))} · Almaty time`
            : "Showing verified, owner-approved listings."}
          {retained && " · Last available data retained."}
        </p>
        <div className="events-toolbar">
          <p className="section-intro">
            The music, the meet-ups, the moments that make a city.
          </p>
          <div className="filter-group" role="group" aria-label="Filter events">
            {["All events", "Music", "Outdoors"].map((f) => (
              <button
                key={t(f)}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {t(f)}
              </button>
            ))}
          </div>
        </div>
        <div className="event-grid">
          {filtered.map((e) => {
            const date = new Date(
              e.startDate.length === 10
                ? e.startDate + "T12:00:00+05:00"
                : e.startDate,
            );
            return (
              <article className="event-card" key={e.id}>
                <div className="event-image">
                  <Image
                    src={e.image}
                    alt={e.imageAlt}
                    fill
                    sizes="(max-width: 700px) 100vw, 33vw"
                    className="cover"
                  />
                  <div className="date-tile">
                    <span>
                      {new Intl.DateTimeFormat(lang, {
                        day: "2-digit",
                        timeZone: "Asia/Almaty",
                      }).format(date)}
                    </span>
                    {new Intl.DateTimeFormat(lang, {
                      month: "short",
                      timeZone: "Asia/Almaty",
                    }).format(date)}
                  </div>
                  <span className="image-caption">{e.imageLabel}</span>
                </div>
                <div className="event-content">
                  <p className="card-category">{e.category}</p>
                  <h3>
                    <a
                      href={e.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {lang === "ru" && e.titleRu ? e.titleRu : e.title}
                      <ArrowUpRight size={20} />
                    </a>
                  </h3>
                  <p className="event-date">
                    <time dateTime={e.startDate}>
                      {new Intl.DateTimeFormat(lang === "ru" ? "ru" : "en-GB", {
                        dateStyle: "medium",
                        ...(e.dateOnly ? {} : { timeStyle: "short" }),
                        timeZone: "Asia/Almaty",
                      }).format(date)}
                    </time>
                    {!e.dateOnly && " · Almaty time"}
                  </p>
                  <p className="place-line">
                    <MapPin size={13} />
                    {e.place}
                  </p>
                  <p className="card-description">
                    {lang === "ru" && e.descriptionRu
                      ? e.descriptionRu
                      : e.description}
                  </p>
                  <a
                    className="source-link"
                    href={e.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Details via {e.sourceName}
                    <ArrowUpRight size={13} />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div className="empty-state">
            <CalendarDays />
            <h3>A little room for spontaneity.</h3>
            <p>
              No verified{" "}
              {filter === "All events"
                ? "events"
                : filter.toLowerCase() + " events"}{" "}
              in this date window. Explore the local calendars below.
            </p>
          </div>
        )}
        <div className="section-bottom">
          <p>
            Dates can change. Confirm with the organiser before making plans.
          </p>
          <a
            className="text-link"
            href="https://ticketon.kz/almaty"
            target="_blank"
            rel="noopener noreferrer"
          >
            Explore the local calendar
            <ArrowUpRight size={16} />
          </a>
        </div>
        <p className="local-sources">
          More local inspiration:{" "}
          {site.localSources.map((source, index) => (
            <span key={source.name}>
              {index > 0 && " · "}
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.name} on Instagram
              </a>
            </span>
          ))}
          . These are independent local sources.
        </p>
      </div>
    </section>
  );
}
