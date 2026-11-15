import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    ...["explore", "plan", "emergency", "privacy"].map((path) => ({
      url: `${siteUrl}/${path}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    { url: `${siteUrl}/credits`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
