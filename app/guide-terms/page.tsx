import { HubHeader, HubFooter } from "@/components/hub/shared";
import { commerceSettings } from "@/lib/platform/store";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Guide terms",
  alternates: { canonical: "/guide-terms" },
};
export default async function Terms() {
  const c = await commerceSettings().catch(() => null);
  return (
    <>
      <HubHeader />
      <main id="main" className="hub-page hub-prose">
        <p className="eyebrow">FOR OUR LOCAL PARTNERS</p>
        <h1>Guide terms</h1>
        <p>
          Updated 19 November 2026. Contact{" "}
          <a href="mailto:aslansaid69@gmail.com">aslansaid69@gmail.com</a>.
        </p>
        <p>
          {c?.guideTerms ||
            "Accept only trips you are qualified and available to lead. Keep client information private and report safety issues promptly."}
        </p>
        <h2>Assignments and availability</h2>
        <p>
          Maintain accurate open and blocked calendar windows. Offers expire
          unless accepted. Declining or allowing an offer to expire permits the
          system to offer the trip to another guide. Accepted tours cannot
          overlap. Do not start a trip until the package is confirmed.
        </p>
        <h2>Fees, commission and transfers</h2>
        <p>
          The fee and commission percentage are snapshotted when the offer is
          made. They represent an allocation within the package, not an extra
          charge to the traveller. Guide-reported completion requires manager
          approval after the scheduled end. The current default transfer delay
          is {c?.payoutDelayHours ?? 24} hours. Actual confirmed card funds,
          payment settlement, refund review and an eligible Stripe Connect
          recipient account are required. A transfer credits your Stripe
          balance; bank payout availability and timing are controlled by Stripe.
          Refunds may reverse prior transfers.
        </p>
        <p>
          Use your actual legal identity and country for onboarding. Where
          provider or country eligibility prevents Connect transfers, arrange
          documented payment accounting with the operator. No automatic transfer
          is promised until onboarding and eligibility checks pass.
        </p>
        <h2>Client privacy and photos</h2>
        <p>
          Access is limited to your assigned confirmed trips. Keep communication
          in the booking thread. Contact details and photo sharing unlock after
          payment. Upload only photos you have permission to share; the booking
          gallery is private and images are deleted 90 days after completion or
          cancellation. Do not upload identity documents. Authorised managers
          can review threads and join the conversation.
        </p>
        <h2>Professional conduct and safety</h2>
        <p>
          Maintain any required qualifications and permissions, state
          accessibility limits accurately and check local conditions. The safety
          alert tool is supplementary; call local emergency services when
          needed. The operator may pause or remove guide access. Contact the
          travel desk for disputes, itinerary changes or a request to replace a
          guide.
        </p>
        <p>
          See <a href="/privacy">privacy</a> and{" "}
          <a href="/terms">client terms</a>.
        </p>
      </main>
      <HubFooter />
    </>
  );
}
