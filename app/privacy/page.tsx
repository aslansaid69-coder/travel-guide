import { HubHeader, HubFooter } from "@/components/hub/shared";
import { PrivacyControls } from "@/components/hub/privacy-controls";
import { T } from "@/components/hub/language";
import { settings } from "@/lib/hub/store";
export const metadata = {
  title: "Privacy & preferences",
  alternates: { canonical: "/privacy" },
  robots: { index: true, follow: true },
};
export const dynamic = "force-dynamic";
export default async function Privacy() {
  const s = await settings().catch(() => null);
  return (
    <>
      <HubHeader />
      <main id="main" className="hub-page hub-prose">
        <p className="eyebrow">YOUR PLANS. YOUR CHOICES.</p>
        <h1>
          <T>Privacy</T>
        </h1>
        <p>
          Updated 16 November 2026. Contact:{" "}
          <a href="mailto:aslansaid69@gmail.com">aslansaid69@gmail.com</a>.{" "}
          {s?.operatorName &&
            `Operator: ${s.operatorName}. ${s.operatorAddress}`}
        </p>
        <h2>What this guide stores</h2>
        <p>
          Your browser stores your language, consent choice, itinerary draft and
          private edit capability. When you save, the server stores the
          itinerary and a hash of its edit token. Shared links show the
          itinerary; contact details, messages and internal notes require
          private edit access, an associated verified account or authorised
          staff access.
        </p>
        <p>
          Booking requests store your name, email, phone if provided, guest
          count and travel preferences so the team can arrange your trip. Avoid
          including unnecessary sensitive information. Allergies and
          accessibility information are optional and are used to plan the
          services you requested.
        </p>
        <h2>Cookies, analytics & external providers</h2>
        <p>
          Neon Auth uses essential sign-in cookies. Optional first-party
          analytics are off until you agree. Analytics record event type, place
          ID and time; the analytics table does not store names or contact
          details. Abuse prevention uses rotating hashed network identifiers for
          two hours. No advertising trackers are installed.
        </p>
        <p>
          Interactive maps contact OpenStreetMap after you load the map, and
          camera playback contacts ipcam.kz. These providers receive normal
          connection information. We do not cache their video streams or map
          tiles for offline use. Google Maps links open an external service.
          When Google Places is configured, live details are attributed to
          Google and kept separate from the independently sourced catalog. See{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Privacy Policy
          </a>{" "}
          and{" "}
          <a
            href="https://maps.google.com/help/terms_maps/"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Maps terms
          </a>
          .
        </p>
        <p>
          Saved records are processed by Neon and Vercel. Resend delivers
          configured emails; Stripe processes configured payments, and Twilio
          may deliver transactional messages if you consent. Card details are
          entered on Stripe Checkout and are not stored by this site. These
          services may process information outside your country. Optional AI
          menu parsing sends only the uploaded menu to the configured parser for
          staff review.
        </p>
        <h2>Email choices & retention</h2>
        <p>
          Request and quote messages relate to services you asked for. A
          one-time abandoned-plan reminder requires its own opt-in. Marketing
          requires separate consent. The daily digest uses confirmation by
          email, and you may unsubscribe with your preference link or contact
          us. Raw menu uploads are not stored by the parser.
        </p>
        <p>
          Unbooked plan email addresses are removed after 90 days of inactivity.
          Analytics are retained for 180 days. Booking and payment records are
          retained as needed to provide services, resolve disputes and meet the
          operator’s recordkeeping obligations. Contact us for access,
          correction, export or deletion, subject to those obligations. Do not
          share a private edit link publicly.
        </p>
        <h2>Booking terms</h2>
        <p>
          {s?.policy ||
            "Requests are not confirmed bookings. Your manager supplies the final quote, inclusions and cancellation terms before payment."}
        </p>
        <p>
          Price ranges and converted currencies are estimates. Only an approved
          final quote determines settlement currency and the amount due. A
          weather reschedule request does not automatically change existing
          bookings. Refunds require team review under the accepted quote terms.
        </p>
        <PrivacyControls />
      </main>
      <HubFooter />
    </>
  );
}
