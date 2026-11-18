import { HubHeader, HubFooter } from "@/components/hub/shared";
import { commerceSettings } from "@/lib/platform/store";
export const dynamic = "force-dynamic";
export const metadata = {
  title: "Client terms",
  alternates: { canonical: "/terms" },
};
export default async function Terms() {
  const c = await commerceSettings().catch(() => null);
  return (
    <>
      <HubHeader />
      <main id="main" className="hub-page hub-prose">
        <p className="eyebrow">A CLEAR AGREEMENT</p>
        <h1>Client terms</h1>
        <p>
          Updated 19 November 2026. Contact{" "}
          <a href="mailto:aslansaid69@gmail.com">aslansaid69@gmail.com</a>.
        </p>
        <h2>Planning and confirmation</h2>
        <p>
          {c?.clientTerms ||
            "Your itinerary is a request until the travel desk confirms availability and the final quote."}
        </p>
        <p>
          Catalog estimates and display-currency conversions are indicative. The
          accepted final quote specifies the package, settlement currency,
          inclusions, deposit and balance. Guide preferences and extra services
          are requests until confirmed. Share only the public itinerary link
          with others; private edit and booking links grant access to your
          travel details.
        </p>
        <h2>Payments and cancellations</h2>
        <p>
          Online card and eligible wallet payments use Stripe’s hosted checkout.
          A return from checkout does not itself prove payment; the signed
          provider webhook updates the booking. Pay on arrival is available only
          when offered by the operator.
        </p>
        <p>
          The quote snapshots the cancellation window and late refund
          percentage. New default policy: free cancellation until{" "}
          {c?.freeCancellationHours ?? 48} hours before the trip’s start date at
          00:00 Almaty time; later card refund {c?.lateRefundPercent ?? 0}% of
          the unrefunded amount paid. Contact the travel desk for rescheduling
          and cash or voucher adjustments. Provider processing times apply.
          Payment PDFs are acknowledgments; ask the operator for a statutory tax
          invoice.
        </p>
        <h2>Guides, weather and safety</h2>
        <p>
          Guides accept assignments according to availability and
          qualifications. Outdoor plans may require an agreed alternative when
          conditions change. City forecasts do not represent all mountain
          conditions. In-site check-ins and emergency alerts depend on network
          access and configured delivery services. Call 112 for immediate
          danger.
        </p>
        <h2>Communication, photos and optional AI</h2>
        <p>
          Authorised staff can access booking threads and private photos to
          arrange the trip. Guide contacts and photo sharing unlock after
          payment. Messages may be translated by an external provider only when
          requested with consent. The optional assistant uses approved catalog
          context; it cannot confirm bookings or perform payment actions. Verify
          its advice with the travel desk.
        </p>
        <h2>Privacy and external sources</h2>
        <p>
          Read our <a href="/privacy">privacy policy</a> for storage, providers
          and deletion requests. Google Maps and Places are subject to{" "}
          <a href="https://maps.google.com/help/terms_maps/">
            Google Maps Terms
          </a>{" "}
          and{" "}
          <a href="https://policies.google.com/privacy">
            Google Privacy Policy
          </a>
          . Independently sourced catalog content and images retain their
          displayed attribution and licences.
        </p>
      </main>
      <HubFooter />
    </>
  );
}
