"use client";
import type { CatalogItem } from "@/lib/hub/types";
import { useLanguage, T } from "@/components/hub/language";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowDown,
  MapPin,
  Sun,
  Route,
  Plus,
  Minus,
} from "lucide-react";
import seedPlaces from "@/data/places.json";
export function Places() {
  const { lang } = useLanguage();
  const [places, setPlaces] = useState(seedPlaces);
  useEffect(() => {
    fetch("/api/hub/catalog")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.items)
          setPlaces(
            data.items
              .filter((i: { image: string }) => !!i.image)
              .map((i: CatalogItem) => ({
                ...i,
                label: i.label || i.category.toUpperCase(),
                category:
                  i.id === "charyn"
                    ? "Day trips"
                    : ["mountains", "viewpoint"].includes(i.category)
                      ? "Mountains"
                      : "City life",
                season: i.season || "Check current visitor information",
                transport:
                  i.transport || "Open directions for the current route.",
                url: i.sourceUrl || i.website,
                mapQuery: i.name,
              })),
          );
      })
      .catch(() => {});
  }, []);
  const [lastSync, setLastSync] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/api/updates/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const source = data?.sources?.find(
          (s: { source_key: string }) => s.source_key === "places.curated",
        );
        if (active && source?.last_success) setLastSync(source.last_success);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const [filter, setFilter] = useState("All places"),
    [all, setAll] = useState(false),
    [expanded, setExpanded] = useState<string[]>([]);
  const selected = places.filter(
      (p) => filter === "All places" || p.category === filter,
    ),
    shown = all || filter !== "All places" ? selected : selected.slice(0, 3);
  return (
    <section id="places" className="section places-section">
      <div className="shell">
        <div className="section-top">
          <div>
            <p className="eyebrow">FROM CITY STREETS TO MOUNTAIN PEAKS</p>
            <h2>
              <T ru="Найдите то, что вдохновляет.">Find your kind of wonder.</T>
            </h2>
          </div>
          <span className="section-note">Places with a story to tell.</span>
        </div>
        <p className="source-updated">
          Owner-approved guide
          {lastSync &&
            ` · synced ${new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Almaty", dateStyle: "medium" }).format(new Date(lastSync))}`}{" "}
          · check current access before travelling.
        </p>
        <div className="places-toolbar">
          <p className="section-intro">
            A few favourites to start your own Almaty story.
          </p>
          <div className="filter-group" role="group" aria-label="Filter places">
            {["All places", "Mountains", "City life", "Day trips"].map((f) => (
              <button
                aria-pressed={filter === f}
                key={f}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
        <div className="place-grid">
          {shown.map((p) => {
            const open = expanded.includes(p.id);
            return (
              <article key={p.id} className="place-card">
                <div className="place-image">
                  <Image
                    src={p.image}
                    unoptimized={p.image.startsWith("https://")}
                    alt={p.alt}
                    fill
                    sizes="(max-width: 700px) 100vw, 33vw"
                    className="cover"
                  />
                  <span className="place-chip">
                    <MapPin size={12} />
                    {p.category}
                  </span>
                  <a
                    className="map-button"
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.mapQuery)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Open ${p.name} on Google Maps`}
                  >
                    <ArrowUpRight size={21} />
                  </a>
                </div>
                <div className="place-content">
                  <p className="card-category">{p.label}</p>
                  <h3>{lang === "ru" && p.nameRu ? p.nameRu : p.name}</h3>
                  <p className="card-description">
                    {lang === "ru" && p.descriptionRu
                      ? p.descriptionRu
                      : p.description}
                  </p>
                  <div className="season">
                    <Sun size={15} />
                    {p.season}
                  </div>
                  <button
                    className="directions-toggle"
                    onClick={() =>
                      setExpanded(
                        open
                          ? expanded.filter((id) => id !== p.id)
                          : [...expanded, p.id],
                      )
                    }
                    aria-expanded={open}
                    aria-controls={`directions-${p.id}`}
                  >
                    <span>
                      <Route size={15} />
                      How to get there
                    </span>
                    {open ? <Minus size={16} /> : <Plus size={16} />}
                  </button>
                  <div
                    id={`directions-${p.id}`}
                    hidden={!open}
                    className="directions"
                  >
                    <p>{p.transport}</p>
                    <a href={p.url} target="_blank" rel="noopener noreferrer">
                      Check visitor information
                      <ArrowUpRight size={12} />
                    </a>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {filter === "All places" && (
          <div className="center-action">
            <button
              className="button button-outline"
              onClick={() => setAll(!all)}
              aria-expanded={all}
            >
              {all ? "Show fewer places" : "Explore all places"}
              <ArrowDown size={17} className={all ? "rotate-180" : ""} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
