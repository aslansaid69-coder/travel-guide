import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { getBooking } from "@/lib/tours/service";
import { loadTourPlacesLoose } from "@/lib/tours/places";
import { STATUS_LABELS } from "@/lib/tours/status";
import { paymentProvider } from "@/lib/payments";
import { HubFooter, HubHeader } from "@/components/hub/shared";
import { RouteMap } from "@/components/tours/route-map";
import { pricingSettings } from "@/lib/tours/service";
import { cancelBooking, payBooking } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your tour booking", robots: { index: false } };
const money = (minor: number, currency = "KZT") =>
  new Intl.NumberFormat("ru-KZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(minor / 100);
const LINE_LABEL = { tickets: "Entrance tickets", transport: "Transport", guide: "Guide", commission: "Service fee" } as const;

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) redirect(`/auth/sign-in?next=/bookings/${encodeURIComponent(id)}`);
  const b = /^tb_[a-z0-9]{8,40}$/.test(id) ? await getBooking(id) : null;
  if (!b || (b.user_id !== user.id && user.role !== "owner" && user.role !== "admin")) notFound();
  const [places, settings] = await Promise.all([loadTourPlacesLoose(b.place_ids), pricingSettings()]);
  const e = b.estimate;
  const provider = paymentProvider();
  const expired = b.status === "pending" && !!b.expires_at && new Date(b.expires_at) < new Date();
  return (
    <>
      <HubHeader />
      <main id="main" className="tour-page">
        <p className="eyebrow">BOOKING {b.id.toUpperCase()}</p>
        <h1>
          {b.start_date === b.end_date ? b.start_date : `${b.start_date} → ${b.end_date}`} · {STATUS_LABELS[b.status].en} /{" "}
          {STATUS_LABELS[b.status].ru}
        </h1>
        {sp.paid && b.status === "pending" && (
          <p className="tour-disclaimer" role="status">
            Thank you! We are waiting for the payment confirmation from the bank — this page updates within a minute.
          </p>
        )}
        {sp.notice && <p className="tour-disclaimer" role="status">{sp.notice}</p>}
        {sp.error && <p className="platform-warning" role="alert">{sp.error}</p>}
        <div className="tour-grid">
          <div>
            <section className="tour-card">
              <h2>Route</h2>
              <RouteMap
                points={places.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng }))}
                start={{ lat: settings.startLat, lng: settings.startLng, label: settings.startLabel }}
              />
              <ol>
                {places.map((p) => (
                  <li key={p.id}>
                    <Link href={`/places/${p.slug || p.id}`}>{p.name}</Link>
                  </li>
                ))}
              </ol>
              <p className="platform-muted">
                ≈ {Math.round(e.distanceKm)} km · {e.days} day{e.days > 1 ? "s" : ""} · {b.adults} adult{b.adults > 1 ? "s" : ""}
                {b.children ? ` + ${b.children} child${b.children > 1 ? "ren" : ""}` : ""} · Guide: {b.guide_name || "—"}
              </p>
            </section>
          </div>
          <aside>
            <section className="tour-card">
              <h2>Price</h2>
              <p className="tour-total">
                ≈ {money(b.estimate_min_minor, b.currency)} – {money(b.estimate_max_minor, b.currency)}
              </p>
              <table className="tour-breakdown">
                <tbody>
                  {e.lines.map((l) => (
                    <tr key={l.key}>
                      <td>
                        {LINE_LABEL[l.key]}
                        <small>{l.detail}</small>
                      </td>
                      <td>{l.min === l.max ? money(l.min, b.currency) : `${money(l.min, b.currency)} – ${money(l.max, b.currency)}`}</td>
                    </tr>
                  ))}
                  <tr>
                    <td>
                      <strong>Online prepayment</strong>
                      <small>{settings.depositPercent}% of the upper estimate</small>
                    </td>
                    <td>{money(b.amount_due_minor, b.currency)}</td>
                  </tr>
                  {b.paid_minor > 0 && (
                    <tr>
                      <td>Paid</td>
                      <td>{money(b.paid_minor - b.refunded_minor, b.currency)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
              {e.unpricedPlaces.length > 0 && (
                <p className="platform-warning">Entrance not included (price not published): {e.unpricedPlaces.join(", ")}.</p>
              )}
              <p className="tour-disclaimer">
                Approximate price — the final amount may differ. Ориентировочная цена, итог может отличаться.
              </p>
              {b.status === "pending" && b.user_id === user.id && (
                <>
                  {expired ? (
                    <p className="platform-warning">
                      This hold expired. <Link href="/build">Build the tour again</Link> to re-check the guide’s calendar.
                    </p>
                  ) : provider.configured() ? (
                    <form action={payBooking}>
                      <input type="hidden" name="id" value={b.id} />
                      <button className="button button-accent">Pay {money(b.amount_due_minor, b.currency)} securely</button>
                      {provider.testMode() && <p className="hub-caption">Test mode — use card 4242 4242 4242 4242.</p>}
                    </form>
                  ) : (
                    <p className="platform-muted">Online payment is being set up. Our team will contact you to confirm and arrange payment.</p>
                  )}
                  <form action={cancelBooking} style={{ marginTop: 10 }}>
                    <input type="hidden" name="id" value={b.id} />
                    <button className="button">Cancel booking</button>
                  </form>
                </>
              )}
            </section>
            <section className="tour-card">
              <h2>What happens next</h2>
              <ol>
                <li>Pay the prepayment (status: Paid).</li>
                <li>Your guide confirms the day plan (status: Confirmed).</li>
                <li>After the tour we settle the final amount (status: Completed) and you can review each place.</li>
              </ol>
            </section>
          </aside>
        </div>
      </main>
      <HubFooter />
    </>
  );
}
