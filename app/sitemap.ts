import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { guidesPublic } from "@/lib/platform/store";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const guides = await guidesPublic().catch(() => []);
  return [
    {
      url: siteUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    ...[
      "explore",
      "plan",
      "emergency",
      "privacy",
      "guides",
      "deals",
      "terms",
      "guide-terms",
    ].map((path) => ({
      url: `${siteUrl}/${path}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...guides.map((g) => ({
      url: `${siteUrl}/guides/${g.id}`,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    { url: `${siteUrl}/credits`, changeFrequency: "monthly", priority: 0.3 },
  ];
}
