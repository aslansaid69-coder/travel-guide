import Link from "next/link";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUpRight,
  MountainSnow,
  MapPin,
  Heart,
  Instagram,
  Globe,
  Github,
} from "lucide-react";
import { Header } from "@/components/header";
import { LiveCameras } from "@/components/live-cameras";
import { Events } from "@/components/events";
import { Places } from "@/components/places";
import { Tips } from "@/components/tips";
import { Reviews } from "@/components/hub/reviews";
import { settings } from "@/lib/hub/store";
import { HubTeaser } from "@/components/hub/teaser";
import { Newsletter } from "@/components/hub/shared";
import { T } from "@/components/hub/language";
import { Contact } from "@/components/contact";
import { getEvents } from "@/lib/events";
import { siteUrl } from "@/lib/site";
import site from "@/data/site.json";
export const revalidate = 86400;
export default async function Home() {
  const { events } = await getEvents();
  const operator = await settings().catch(() => null);
  const guideSchema = {
    "@context": "https://schema.org",
    "@type": "TravelGuide",
    name: "Almaty, with love",
    description: site.description,
    url: siteUrl,
    inLanguage: "en",
    about: {
      "@type": "City",
      name: "Almaty",
      address: { "@type": "PostalAddress", addressCountry: "KZ" },
    },
  };
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      guideSchema,
      ...events.map((event) => ({
        "@type": "Event",
        name: event.title,
        description: event.description,
        startDate: event.startDate,
        ...(event.endDate ? { endDate: event.endDate } : {}),
        location: {
          "@type": "Place",
          name: event.place,
          address: {
            "@type": "PostalAddress",
            addressLocality: "Almaty",
            addressCountry: "KZ",
          },
        },
        url: event.sourceUrl,
        image: new URL(event.image, siteUrl).toString(),
      })),
      ...(operator?.operatorName
        ? [
            {
              "@type": "TravelAgency",
              name: operator.operatorName,
              address: operator.operatorAddress,
              url: siteUrl,
              email: site.contactEmail,
            },
          ]
        : []),
    ],
  };
  return (
    <>
      <Header />
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <Image
            src="/images/hero.jpg"
            alt="Snow-covered Tian Shan peaks above the meadows and spruce forests of Ile-Alatau National Park"
            fill
            priority
            sizes="100vw"
            className="hero-image"
          />
          <div className="hero-overlay" />
          <div className="shell hero-content">
            <p className="hero-eyebrow">
              <span /> YOUR NEXT GREAT DISCOVERY · KAZAKHSTAN
            </p>
            <h1 id="hero-title">
              <T>City soul.</T>
              <br />
              <em>
                <T>Mountain heart.</T>
              </em>
            </h1>
            <p className="hero-copy">
              <T ru="Тенистые улицы. Снежные вершины. Тёплый приём.">
                Tree-lined streets. Snow-capped peaks. A warm welcome.
              </T>
              <br className="desktop-break" />{" "}
              <T ru="Приезжайте ради гор. Оставайтесь ради всего остального.">
                Come for the mountains. Stay for everything else.
              </T>
            </p>
            <div className="hero-actions">
              <a href="#places" className="button button-accent">
                <T>Discover Almaty</T>
                <ArrowUpRight size={19} />
              </a>
              <a href="#live" className="hero-live-link">
                <span className="pulse-dot" />
                <T>See the city live</T>
                <ArrowUpRight size={16} />
              </a>
            </div>
          </div>
          <div className="shell hero-bottom">
            <span>
              <MapPin size={15} />
              At the foot of the Tian Shan
            </span>
            <a href="#live">
              A breath of fresh perspective
              <ArrowDown size={16} />
            </a>
            <span className="hero-coordinates">
              43.2389° N &nbsp; 76.8897° E
            </span>
          </div>
        </section>
        <LiveCameras />
        <Events initialEvents={events} />
        <section className="quote-band">
          <div className="shell">
            <MountainSnow size={34} strokeWidth={1} />
            <p>
              <T ru="В одни города приезжают.">Some cities you visit.</T>
              <br className="mobile-break" />{" "}
              <em>
                <T ru="Этот остаётся с вами.">This one stays with you.</T>
              </em>
            </p>
            <span>WELCOME TO ALMATY</span>
          </div>
        </section>
        <HubTeaser />
        <Places />
        <Tips />
        <div className="shell">
          <Reviews />
          <Newsletter />
        </div>
        <section id="contact" className="section contact-section">
          <div className="shell contact-layout">
            <div>
              <p className="eyebrow">LET’S KEEP IN TOUCH</p>
              <h2>
                <T ru="Хорошая поездка начинается">A good trip starts</T>
                <br />
                <T ru="с простого приветствия.">with a little hello.</T>
              </h2>
              <p>
                <T ru="Есть вопрос или любимое место, которым хочется поделиться?">
                  Have a question or a favourite spot to share?
                </T>
                <br />
                <T ru="Напишите нам. Нам всегда интересно.">
                  Drop us a note. We’re always curious.
                </T>
              </p>
            </div>
            <Contact />
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="shell">
          <div className="footer-top">
            <Link href="/" className="brand footer-brand">
              <MountainSnow size={32} strokeWidth={1.3} />
              <span>
                almaty<span className="brand-dot">.</span>
                <small>WITH LOVE</small>
              </span>
            </Link>
            <p>
              A city worth getting to know.
              <br />A guide to help you feel at home.
            </p>
            <div className="footer-socials">
              <a
                href="https://github.com/aslansaid69-coder/travel-guide"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Travel guide on GitHub"
              >
                <Github size={19} />
              </a>
              {site.localSources.map((source) => (
                <a
                  key={source.name}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${source.name} local events on Instagram`}
                >
                  <Instagram size={16} />
                  {source.name}
                </a>
              ))}
              <a
                href="https://visitalmaty.kz/"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Globe size={17} />
                Official city guide
                <ArrowUpRight size={14} />
              </a>
            </div>
          </div>
          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} Almaty, with love. An independent
              travel guide.
            </span>
            <a href="/credits">Photo & source credits</a>
            <a href="/privacy">Privacy</a>
            <a href="/emergency">Emergency help</a>
            <a href="/admin/hub">Travel desk</a>
            <span>
              Made with{" "}
              <Heart size={12} className="heart" fill="currentColor" /> in
              Almaty
            </span>
          </div>
        </div>
      </footer>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />
    </>
  );
}
