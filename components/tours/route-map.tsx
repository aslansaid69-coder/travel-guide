"use client";
import { useEffect, useRef } from "react";

export type MapPoint = { id: string; name: string; lat: number; lng: number };

/**
 * Leaflet + OpenStreetMap route map: numbered markers for chosen places and the
 * start → places → start loop. Works with touch; wheel zoom only after a click (no scroll traps).
 */
export function RouteMap({
  points,
  start,
  loop = true,
  height = 360,
  label = "Map of the selected places",
}: {
  points: MapPoint[];
  start?: { lat: number; lng: number; label: string };
  loop?: boolean;
  height?: number;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const key = JSON.stringify([points.map((p) => [p.lat, p.lng]), start?.lat, start?.lng]);
  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let disposed = false;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (disposed || !ref.current) return;
      map = L.map(ref.current, { scrollWheelZoom: false, zoomControl: true }).setView([43.2389, 76.8897], 11);
      map.on("click", () => map?.scrollWheelZoom.enable());
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);
      const pin = (text: string, variant = "") =>
        L.divIcon({ className: `route-pin ${variant}`, html: `<span>${text}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      const latlngs: [number, number][] = [];
      if (start) {
        latlngs.push([start.lat, start.lng]);
        L.marker([start.lat, start.lng], { icon: pin("⌂", "route-pin-start"), title: start.label })
          .bindTooltip(start.label)
          .addTo(map);
      }
      points.forEach((p, i) => {
        latlngs.push([p.lat, p.lng]);
        const el = document.createElement("strong");
        el.textContent = `${i + 1}. ${p.name}`;
        L.marker([p.lat, p.lng], { icon: pin(String(i + 1)), title: p.name }).bindPopup(el).addTo(map!);
      });
      if (start && loop && points.length) latlngs.push([start.lat, start.lng]);
      if (latlngs.length > 1)
        L.polyline(latlngs, { color: "#FF6B35", weight: 4, opacity: 0.85, dashArray: "8 8" }).addTo(map);
      if (latlngs.length) map.fitBounds(L.latLngBounds(latlngs), { padding: [30, 30], maxZoom: 14 });
    })();
    return () => {
      disposed = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures every coordinate that matters
  }, [key]);
  return <div ref={ref} className="route-map" style={{ height }} role="region" aria-label={label} />;
}
