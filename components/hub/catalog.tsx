"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Plus, MapPin, Clock } from "lucide-react";
import type { CatalogItem } from "@/lib/hub/types";
import { maps, km, centre, openNow, money, mealPrice } from "@/lib/hub/core";
import { TravelMap } from "./map";
import { useT, useLanguage } from "./language";
import { api } from "./shared";
const categories = [
  "all",
  "mountains",
  "viewpoint",
  "park",
  "museum",
  "market",
  "restaurant",
  "cafe",
  "shop",
  "activity",
  "transfer",
  "rental",
];
export function CatalogCard({
  item,
  onAdd,
}: {
  item: CatalogItem;
  onAdd?: (i: CatalogItem) => void;
}) {
  const [menu, setMenu] = useState(false),
    t = useT(),
    { lang } = useLanguage();
  const p = ["restaurant", "cafe"].includes(item.category)
      ? mealPrice(item)
      : item.price,
    open = openNow(item);
  return (
    <article className="hub-catalog-card">
      {item.image ? (
        <img src={item.image} alt={item.alt || item.name} loading="lazy" />
      ) : (
        <div className="hub-image-placeholder">
          <MapPin size={32} />
          <span>{t(item.category)}</span>
        </div>
      )}
      <div className="hub-card-body">
        <p className="eyebrow">
          {t(item.category)} · {km(centre, item).toFixed(1)} km
        </p>
        <h3>{lang === "ru" && item.nameRu ? item.nameRu : item.name}</h3>
        <p>
          {lang === "ru" && item.descriptionRu
            ? item.descriptionRu
            : item.description}
        </p>
        <div className="hub-card-meta">
          <span>
            <Clock size={13} />
            {item.duration} min
          </span>
          <span className={open === true ? "hub-open" : ""}>
            {t(
              open === true
                ? "Open now"
                : open === false
                  ? "Closed now"
                  : "Hours unverified",
            )}
          </span>
          {item.rating !== null && (
            <span>
              ★ {item.rating} ({item.reviews})
            </span>
          )}
        </div>
        {item.hours && <p className="hub-caption">{item.hours}</p>}
        <p className="hub-card-price">
          {p
            ? `${money(p.min, p.currency)}${p.max !== p.min ? ` – ${money(p.max, p.currency)}` : ""} · ${t(p.source === "owner-confirmed" ? "Confirmed price" : "Estimate")}`
            : t("Price to confirm")}
        </p>
        <div className="hub-inline-actions">
          <a href={maps(item)} target="_blank" rel="noopener noreferrer">
            {t("Google Maps")}
            <ArrowUpRight size={13} />
          </a>
          <a href={maps(item, true)} target="_blank" rel="noopener noreferrer">
            {t("Get directions")}
          </a>
        </div>
        {item.phone && (
          <a href={`tel:${item.phone.replace(/[^+\d]/g, "")}`}>{item.phone}</a>
        )}
        {item.website && (
          <a href={item.website} target="_blank" rel="noopener noreferrer">
            Website ↗
          </a>
        )}
        {item.menu.length > 0 && (
          <>
            <button
              className="hub-link"
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
            >
              {t("View menu")} ({item.menu.length})
            </button>
            {menu && (
              <ul className="hub-menu-list">
                {item.menu.map((m) => (
                  <li key={m.id}>
                    {m.photo && (
                      <img loading="lazy" src={m.photo} alt={m.name} />
                    )}
                    <strong>{m.name}</strong>
                    <span>{money(m.price, item.menuCurrency)}</span>
                    <p>{m.description}</p>
                    <small>{m.tags.join(" · ")}</small>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        <p className="hub-caption">
          {item.sourceUrl ? (
            <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
              {item.source} ↗
            </a>
          ) : (
            item.source
          )}
          {item.verifiedAt && ` · ${item.verifiedAt.slice(0, 10)}`}
        </p>
        {onAdd ? (
          <button className="button button-accent" onClick={() => onAdd(item)}>
            <Plus size={15} />
            {t("Add to plan")}
          </button>
        ) : (
          <a
            className="button button-outline"
            href={`/plan?add=${encodeURIComponent(item.id)}`}
          >
            {t("Add to plan")}
            <Plus size={15} />
          </a>
        )}
      </div>
    </article>
  );
}
export function Catalog({
  initialItems,
  onAdd,
  compact = false,
}: {
  initialItems?: CatalogItem[];
  onAdd?: (i: CatalogItem) => void;
  compact?: boolean;
}) {
  const [items, setItems] = useState(initialItems || []),
    [category, setCategory] = useState("all"),
    [query, setQuery] = useState(""),
    [view, setView] = useState("list"),
    [message, setMessage] = useState("");
  const t = useT();
  useEffect(() => {
    if (!initialItems)
      void api("catalog")
        .then((d) => setItems(d.items))
        .catch((e) => setMessage(e.message));
  }, [initialItems]);
  const shown = useMemo(
    () =>
      items.filter(
        (i) =>
          (category === "all" || i.category === category) &&
          `${i.name} ${i.nameRu} ${i.description}`
            .toLowerCase()
            .includes(query.toLowerCase()),
      ),
    [items, category, query],
  );
  return (
    <div
      className={compact ? "hub-catalog hub-catalog-compact" : "hub-catalog"}
    >
      <div className="hub-catalog-toolbar">
        <label className="hub-search">
          <span className="sr-only">{t("Search places")}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("Search places")}
          />
        </label>
        <div className="hub-segment">
          <button
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
          >
            {t("List")}
          </button>
          <button aria-pressed={view === "map"} onClick={() => setView("map")}>
            {t("Map")}
          </button>
        </div>
      </div>
      <div className="hub-category-filters">
        {categories.map((c) => (
          <button
            key={c}
            aria-pressed={category === c}
            onClick={() => setCategory(c)}
          >
            {t(c === "all" ? "All" : c)}
          </button>
        ))}
      </div>
      <p role="status" className="hub-caption">
        {message || `${shown.length} places`}
      </p>
      {view === "map" ? (
        <TravelMap items={shown} onSelect={onAdd} />
      ) : (
        <div className="hub-catalog-grid">
          {shown.map((item) => (
            <CatalogCard key={item.id} item={item} onAdd={onAdd} />
          ))}
        </div>
      )}
    </div>
  );
}
