import { Planner } from "@/components/hub/planner";
import { HubHeader, HubFooter } from "@/components/hub/shared";
import { getPlan } from "@/lib/hub/store";
import { notFound } from "next/navigation";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Your Almaty itinerary",
  robots: { index: false, follow: false },
};
export default async function Trip({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const plan = await getPlan(id).catch(() => null);
  if (!plan) notFound();
  return (
    <>
      <HubHeader />
      <main id="main" className="hub-page">
        <Planner id={id} initial={plan.data} />
      </main>
      <HubFooter />
    </>
  );
}
