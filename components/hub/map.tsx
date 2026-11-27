"use client";
import { useEffect, useRef, useState } from "react";
import type { CatalogItem } from "@/lib/hub/types";
import { api } from "./shared";
import { useT } from "./language";
import type { RouteResult } from "@/lib/hub/routing";
export function TravelMap({
  items,
  route,
  onSelect,
}: {
  items: CatalogItem[];
  route?: CatalogItem[];
  onSelect?: (item: CatalogItem) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [loaded, setLoaded] = useState(false),
    [routing, setRouting] = useState<RouteResult | null>(null);
  const t = useT();
  useEffect(() => {
    let live = true;
    if (route?.length)
      void api("route", { itemIds: route.map((i) => i.id) })
        .then((d: RouteResult) => {
          if (live) setRouting(d);
        })
        .catch(() => {
          if (live) setRouting(null);
        });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs browser-only state (URL, storage, clock) or an async fetch result after hydration
    else setRouting(null);
    return () => {
      live = false;
    };
  }, [route]);
  useEffect(() => {
    if (!loaded || !ref.current) return;
    let disposed = false;
    let map: import("leaflet").Map | undefined;
    void (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet.markercluster");
      if (disposed || !ref.current) return;
      map = L.map(ref.current, { scrollWheelZoom: false }).setView(
        [43.2389, 76.8897],
        12,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
      }).addTo(map);
      const cluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 45,
      });
      items.forEach((item, index) => {
        const marker = L.marker([item.lat, item.lng], {
          icon: L.divIcon({
            className: "hub-map-pin",
            html: `<span>${route ? index + 1 : "•"}</span>`,
            iconSize: [30, 30],
          }),
        });
        const content = document.createElement("div");
        const name = document.createElement("strong");
        name.textContent = item.name;
        content.append(name);
        if (onSelect) {
          const button = document.createElement("button");
          button.textContent = t("Add to plan");
          button.addEventListener("click", () => onSelect(item));
          content.append(document.createElement("br"), button);
        }
        marker.bindPopup(content);
        cluster.addLayer(marker);
      });
      map.addLayer(cluster);
      if (items.length)
        map.fitBounds(
          L.latLngBounds(items.map((i) => [i.lat, i.lng] as [number, number])),
          { padding: [35, 35], maxZoom: 13 },
        );
      if (route && route.length > 1)
        L.polyline(
          routing?.coordinates
            ? routing.coordinates.map((p: number[]) => [p[1], p[0]])
            : route.map((i) => [i.lat, i.lng]),
          {
            color: "#FF6B35",
            weight: 3,
            ...(routing?.estimated !== false ? { dashArray: "7 7" } : {}),
          },
        ).addTo(map);
    })();
    return () => {
      disposed = true;
      map?.remove();
    };
  }, [items, route, onSelect, loaded, t, routing]);
  return (
    <div className="hub-map-wrap">
      {loaded ? (
        <div ref={ref} className="hub-map" aria-label="Map of Almaty places" />
      ) : (
        <div className="hub-map-placeholder">
          <span>43.2389° N · 76.8897° E</span>
          <h3>Almaty, on the map.</h3>
          <button
            className="button button-outline"
            onClick={() => setLoaded(true)}
          >
            {t("Load interactive map")}
          </button>
          <small>{t("Map tiles are provided by OpenStreetMap.")}</small>
        </div>
      )}
      {route && (
        <p className="hub-caption">
          {routing?.source ||
            "Straight-line overview. Road routes and travel times are estimates; open Google Maps for navigation."}
        </p>
      )}
      {route && routing && routing.legs.length > 0 && (
        <ol className="hub-route-legs">
          {routing.legs.map((leg, i) => (
            <li key={i}>
              {route[i]?.name} → {route[i + 1]?.name}: {leg.duration} min ·{" "}
              {leg.distance.toFixed(1)} km{" "}
              {routing.estimated ? "(estimate)" : ""}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
