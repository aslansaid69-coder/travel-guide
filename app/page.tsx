import Image from "next/image";
import {
  ArrowDown,
  ArrowUpRight,
  MountainSnow,
  MapPin,
  Heart,
  Instagram,
  Globe,
  Facebook,
  Github,
} from "lucide-react";
import { Header } from "@/components/header";
import { LiveCameras } from "@/components/live-cameras";
import { Events } from "@/components/events";
import { Places } from "@/components/places";
import { Tips } from "@/components/tips";
import { Contact } from "@/components/contact";
import { getEvents } from "@/lib/events";
import { siteUrl } from "@/lib/site";
import site from "@/data/site.json";
export const revalidate = 86400;
export default async function Home() {
  const { events } = await getEvents();
  const jsonLd = {
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
              City soul.
              <br />
              <em>Mountain heart.</em>
            </h1>
            <p className="hero-copy">
              Tree-lined streets. Snow-capped peaks. A warm welcome.
              <br className="desktop-break" /> Come for the mountains. Stay for
              everything else.
            </p>
            <div className="hero-actions">
              <a href="#places" className="button button-accent">
                Discover Almaty
                <ArrowUpRight size={19} />
              </a>
              <a href="#live" className="hero-live-link">
                <span className="pulse-dot" />
                See the city live
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
              Some cities you visit.
              <br className="mobile-break" /> <em>This one stays with you.</em>
            </p>
            <span>WELCOME TO ALMATY</span>
          </div>
        </section>
        <Places />
        <Tips />
        <section id="contact" className="section contact-section">
          <div className="shell contact-layout">
            <div>
              <p className="eyebrow">LET’S KEEP IN TOUCH</p>
              <h2>
                A good trip starts
                <br />
                with <em>a little hello.</em>
              </h2>
              <p>
                Have a question or a favourite spot to share?
                <br />
                Drop us a note. We’re always curious.
              </p>
            </div>
            <Contact />
          </div>
        </section>
      </main>
      <footer className="footer">
        <div className="shell">
          <div className="footer-top">
            <a href="/" className="brand footer-brand">
              <MountainSnow size={32} strokeWidth={1.3} />
              <span>
                almaty<span className="brand-dot">.</span>
                <small>WITH LOVE</small>
              </span>
            </a>
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
              {site.instagramUrl && (
                <a
                  href={site.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Our Instagram"
                >
                  <Instagram size={19} />
                </a>
              )}
              {site.facebookUrl && (
                <a
                  href={site.facebookUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Our Facebook"
                >
                  <Facebook size={19} />
                </a>
              )}
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
