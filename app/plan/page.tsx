import { Planner } from "@/components/hub/planner";
import { HubHeader, HubFooter } from "@/components/hub/shared";
export const metadata = {
  title: "Build your Almaty itinerary",
  alternates: { canonical: "/plan" },
};
export default function PlanPage() {
  return (
    <>
      <HubHeader />
      <main id="main" className="hub-page">
        <Planner />
      </main>
      <HubFooter />
    </>
  );
}
