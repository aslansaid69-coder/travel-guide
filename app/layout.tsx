import type { Metadata } from "next";
import localFont from "next/font/local";
import { siteUrl } from "@/lib/site";
import "./globals.css";
import "./styles/controls.css";
import "./styles/platform.css";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { LanguageProvider } from "@/components/hub/language";
import { AssistantChat } from "@/components/assistant/chat";
import { Consent } from "@/components/hub/shared";
const inter = localFont({
  src: [
    {
      path: "../node_modules/@fontsource/inter/files/inter-latin-400-normal.woff2",
      weight: "400",
    },
    {
      path: "../node_modules/@fontsource/inter/files/inter-latin-500-normal.woff2",
      weight: "500",
    },
    {
      path: "../node_modules/@fontsource/inter/files/inter-latin-600-normal.woff2",
      weight: "600",
    },
  ],
  variable: "--font-inter",
  display: "swap",
});
const serif = localFont({
  src: [
    {
      path: "../node_modules/@fontsource/dm-serif-display/files/dm-serif-display-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource/dm-serif-display/files/dm-serif-display-latin-400-italic.woff2",
      weight: "400",
      style: "italic",
    },
  ],
  variable: "--font-serif",
  display: "swap",
});
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Almaty, with love — City soul. Mountain heart.",
    template: "%s | Almaty, with love",
  },
  description:
    "Discover Almaty, Kazakhstan: live mountain webcams, local events, seven unforgettable places, and practical travel tips for your first visit.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Almaty, with love",
    title: "Almaty, with love — City soul. Mountain heart.",
    description:
      "Your thoughtful guide to the city at the foot of the Tian Shan.",
    url: "/",
    images: [
      {
        url: "/images/hero.jpg",
        width: 1600,
        height: 900,
        alt: "Snow-covered Tian Shan mountains near Almaty",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Almaty, with love",
    description: "City soul. Mountain heart. Your guide to Almaty.",
    images: ["/images/hero.jpg"],
  },
  robots: { index: true, follow: true },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${serif.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <LanguageProvider>
          {children}
          <Consent />
          <AssistantChat />
        </LanguageProvider>
      </body>
    </html>
  );
}
