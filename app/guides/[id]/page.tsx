import { GuideMarketplace } from "@/components/platform/guides";
import type { GuidesPublicView } from "@/components/platform/view-types";
import { guidesPublic } from "@/lib/platform/store";
import { database } from "@/lib/db";
import { notFound } from "next/navigation";
import { siteUrl } from "@/lib/site";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const g = (await guidesPublic(id).catch(() => []))[0];
  return {
    title: g ? `${g.name} · Almaty guide` : "Almaty guide",
    alternates: { canonical: `/guides/${id}` },
  };
}
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const guides = await guidesPublic(id).catch(() => []);
  if (!guides.length) notFound();
  const reviews =
    await database()`SELECT v.rating,v.body,v.created_at FROM guide_reviews v JOIN guide_assignments a ON a.id=v.assignment_id WHERE a.guide_id=${id} AND v.status='approved' ORDER BY v.created_at DESC LIMIT 50`;
  const g = guides[0];
  const schema = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: g.name,
    description: g.bio,
    knowsLanguage: g.languages,
    url: `${siteUrl}/guides/${id}`,
    ...(g.photo ? { image: g.photo } : {}),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema).replaceAll(
            "<",
            String.fromCharCode(92) + "u003c",
          ),
        }}
      />
      <GuideMarketplace
        id={id}
        initial={{ guides, reviews: reviews as GuidesPublicView["reviews"] }}
      />
    </>
  );
}
