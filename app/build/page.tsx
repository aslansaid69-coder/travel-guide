import type { Metadata } from "next";
import { catalog } from "@/lib/hub/store";
import { pricingSettings } from "@/lib/tours/service";
import { HubFooter, HubHeader } from "@/components/hub/shared";
import { TourBuilder, type BuilderPlace } from "@/components/tours/builder";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Build your tour",
  description: "Pick 3–4 places in and around Almaty, see an approximate price with a full breakdown, the route on a map, and choose your guide.",
  alternates: { canonical: "/build" },
};

export default async function BuildPage() {
  const [items, settings] = await Promise.all([catalog().catch(() => []), pricingSettings()]);
  const places: BuilderPlace[] = items
    .filter((i) => !["restaurant", "cafe", "shop", "transfer", "rental"].includes(i.category))
    .map((i) => ({
      id: i.id,
      slug: i.slug || i.id,
      name: i.name,
      nameRu: i.nameRu,
      nameKk: i.nameKk,
      category: i.category,
      region: i.region,
      image: i.photos[0]?.url || i.image,
      duration: i.duration,
      lat: i.lat,
      lng: i.lng,
      priceLabel:
        i.priceStatus === "not_found" || !i.price
          ? ""
          : i.price.type === "free"
            ? "free"
            : `${Math.round(i.price.min / 100).toLocaleString("ru-RU")}${i.price.max > i.price.min ? `–${Math.round(i.price.max / 100).toLocaleString("ru-RU")}` : ""} ${i.price.currency === "KZT" ? "₸" : i.price.currency}`,
    }));
  return (
    <>
      <HubHeader />
      <main id="main" className="tour-page">
        <TourBuilder
          places={places}
          maxPlaces={settings.maxPlaces}
          start={{ lat: settings.startLat, lng: settings.startLng, label: settings.startLabel }}
          depositPercent={settings.depositPercent}
        />
      </main>
      <HubFooter />
    </>
  );
}
