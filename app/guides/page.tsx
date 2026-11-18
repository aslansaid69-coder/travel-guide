import { GuideMarketplace } from "@/components/platform/guides";
import { guidesPublic } from "@/lib/platform/store";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Local Almaty guides",
  alternates: { canonical: "/guides" },
};
export default async function Page() {
  const guides = await guidesPublic().catch(() => []);
  return <GuideMarketplace initial={{ guides, reviews: [] }} />;
}
