import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Almaty, with love",
    short_name: "Almaty",
    description: "Your Almaty travel guide and itinerary builder",
    start_url: "/",
    display: "standalone",
    background_color: "#F4EFE6",
    theme_color: "#1F3A4D",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
