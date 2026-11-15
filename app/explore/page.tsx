import { HubHeader, HubFooter, Newsletter } from "@/components/hub/shared";
import { Catalog } from "@/components/hub/catalog";
import { T } from "@/components/hub/language";
import { catalog } from "@/lib/hub/store";
import { siteUrl } from "@/lib/site";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Explore Almaty",
  alternates: { canonical: "/explore" },
};
export default async function Explore() {
  const items = await catalog().catch(() => []);
  const schema = {
    "@context": "https://schema.org",
    "@graph": items.map((i) => ({
      "@type": ["restaurant", "cafe"].includes(i.category)
        ? "Restaurant"
        : "TouristAttraction",
      name: i.name,
      description: i.description,
      url: i.website || `${siteUrl}/explore`,
      image: i.image ? new URL(i.image, siteUrl).toString() : undefined,
      geo: { "@type": "GeoCoordinates", latitude: i.lat, longitude: i.lng },
      ...(i.phone ? { telephone: i.phone } : {}),
      ...(i.price?.source === "owner-confirmed"
        ? {
            offers: {
              "@type": "Offer",
              price: i.price.min / 100,
              priceCurrency: i.price.currency,
            },
          }
        : {}),
    })),
  };
  return (
    <>
      <HubHeader />
      <main id="main" className="hub-page">
        <div className="hub-page-heading">
          <p className="eyebrow">
            CITY STREETS. MOUNTAIN PEAKS. YOUR NEXT STOP.
          </p>
          <h1>
            <T>Find your kind of wonder.</T>
          </h1>
          <p>
            <T ru="Одобренные места для вашего маршрута. Проверяйте часы работы и доступ перед поездкой.">
              Approved places for your Almaty story. Check current hours and
              access before heading out.
            </T>
          </p>
        </div>
        <Catalog initialItems={items} />
        <Newsletter />
      </main>
      <HubFooter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
