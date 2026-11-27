import Link from "next/link";
import type { Metadata } from "next";
import Image from "next/image";
import { Header } from "@/components/header";
import credits from "@/data/photo-credits.json";
export const metadata: Metadata = {
  title: "Photo & source credits",
  alternates: { canonical: "/credits" },
};
export default function Credits() {
  return (
    <>
      <Header />
      <main id="main" className="shell credits-page">
        <p className="eyebrow">THE PEOPLE BEHIND THE PERSPECTIVE</p>
        <h1>Photo & source credits</h1>
        <p>
          Real places, generously shared by their photographers. Images are
          resized, compressed, and responsively cropped. Share-alike image
          adaptations retain the licence listed below.
        </p>
        <div className="credits-grid">
          {credits.map((c) => (
            <article key={c.id}>
              <Image
                src={c.file}
                alt={c.alt}
                width={400}
                height={250}
                style={{ objectFit: "cover" }}
              />
              <h2>
                {c.id === "hero"
                  ? "Tian Shan mountains"
                  : c.id.replaceAll("-", " ")}
              </h2>
              <p>Photograph by {c.author}</p>
              <p>
                <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">
                  Original image
                </a>{" "}
                ·{" "}
                <a
                  href={c.licenseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {c.license}
                </a>
              </p>
              <small>{c.changes}</small>
            </article>
          ))}
        </div>
        <h2>Live cameras</h2>
        <p>
          Direct HLS streams are provided by <strong>ipcam.kz</strong>. Scenic
          previews are photographs, not live camera frames. Streams start only
          when selected, and unavailable feeds do not redirect to other
          websites. Provider overlays, continuous availability, and embedding
          permissions remain the operator’s responsibility.
        </p>
        <h2>Events & travel information</h2>
        <p>
          Event dates and venues are attributed to their organisers or ticket
          listings on each card. Descriptions are original editorial summaries.
          Event images show Almaty scenery, not official posters or coverage of
          the event. Always confirm the listing before booking.
        </p>
        <p>
          Travel information links to official tourism, resort, government, and
          operator sources. Entry requirements, mountain access, and schedules
          may change. This is an independent guide, not an official tourism
          service.
        </p>
        <h2>Maps, catalog data & fonts</h2>
        <p>
          Map data and OSM-derived catalog records are credited to{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >
            OpenStreetMap contributors
          </a>
          . Their source and attribution remain attached to each listing. Owner
          text and independently supplied photographs retain their own source
          credits. Google details, when configured, are fetched live and
          attributed separately. Driving routes, when configured, are credited
          to openrouteservice by HeiGIT and OpenStreetMap contributors.
        </p>
        <p>
          PDF exports embed Noto Sans under the SIL Open Font License; its
          licence is included with the project source. The website uses Inter
          and DM Serif Display.
        </p>
        <Link className="button button-outline" href="/">
          Back to Almaty
        </Link>
      </main>
    </>
  );
}
