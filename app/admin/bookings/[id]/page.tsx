import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { database } from "@/lib/db";
import { getBooking } from "@/lib/tours/service";
import { loadTourPlacesLoose } from "@/lib/tours/places";
import { nextStatuses, STATUS_LABELS, statusTone as tone } from "@/lib/tours/status";
import { Badge, formatDate, formatMoney, Notice, PageHeader } from "@/components/admin/ui";
import { ConfirmButton } from "@/components/admin/confirm";
import { changeBookingStatus, refund } from "../actions";
import type { SearchParams } from "@/lib/admin/list";

export const metadata = { title: "Booking" };

export default async function BookingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  const user = await requirePage("bookings.view", `/admin/bookings/${id}`);
  const raw = await searchParams;
  const b = /^tb_[a-z0-9]{8,40}$/.test(id) ? await getBooking(id) : null;
  if (!b) notFound();
  const sql = database();
  const [places, events, payments] = await Promise.all([
    loadTourPlacesLoose(b.place_ids),
    sql`SELECT from_status,to_status,actor,note,created_at FROM tour_booking_events WHERE booking_id=${id} ORDER BY id`,
    sql`SELECT id,provider,provider_session_id,provider_payment_id,amount_minor,currency,status,refunded_minor,livemode,created_at FROM tour_payments WHERE booking_id=${id} ORDER BY created_at DESC`,
  ]);
  const staffMoves = nextStatuses(b.status).filter((s) => s === "confirmed" || s === "completed" || s === "cancelled");
  const refundable = b.paid_minor - b.refunded_minor;
  return (
    <>
      <PageHeader title={`Booking ${b.id}`} intro={`${b.start_date} → ${b.end_date} · ${b.days} day(s) · ${b.adults + b.children} travellers`}>
        <Badge tone={tone(b.status)}>{STATUS_LABELS[b.status].en}</Badge>
        <Link className="admin-button" href="/admin/bookings">
          ← All bookings
        </Link>
      </PageHeader>
      <Notice message={raw.notice} tone="ok" />
      <Notice message={raw.error} tone="bad" />
      <div className="admin-two">
        <div>
          <section className="admin-card">
            <h2>Traveller</h2>
            <p>
              {b.contact.name} · {b.email} · {b.contact.phone}
            </p>
            {b.notes && <p className="admin-muted">“{b.notes}”</p>}
            <p>Guide: {b.guide_name || "—"} · Language: {b.language.toUpperCase()}</p>
          </section>
          <section className="admin-card">
            <h2>Route</h2>
            <ol>
              {places.map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/places/${encodeURIComponent(p.id)}`}>{p.name}</Link>
                </li>
              ))}
            </ol>
            <p className="admin-muted">
              ≈ {Math.round(b.estimate.distanceKm)} km · driving ≈ {b.estimate.driveMinutes} min · visits {b.estimate.visitMinutes} min
            </p>
          </section>
          <section className="admin-card">
            <h2>History</h2>
            <ul>
              {events.map((e, i) => (
                <li key={i}>
                  {formatDate(e.created_at as string)} · {String(e.from_status || "—")} → {String(e.to_status)} · {String(e.actor)}
                  {e.note ? ` · ${String(e.note)}` : ""}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <div>
          <section className="admin-card">
            <h2>Money</h2>
            <table className="admin-table">
              <tbody>
                {b.estimate.lines.map((l) => (
                  <tr key={l.key}>
                    <td>
                      {l.label}
                      <small>{l.detail}</small>
                    </td>
                    <td>
                      {formatMoney(l.min, b.currency)}
                      {l.max !== l.min && ` – ${formatMoney(l.max, b.currency)}`}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td><strong>Estimate</strong></td>
                  <td>{formatMoney(b.estimate_min_minor, b.currency)} – {formatMoney(b.estimate_max_minor, b.currency)}</td>
                </tr>
                <tr>
                  <td>Prepayment due</td>
                  <td>{formatMoney(b.amount_due_minor, b.currency)}</td>
                </tr>
                <tr>
                  <td>Paid / refunded</td>
                  <td>
                    {formatMoney(b.paid_minor, b.currency)} / {formatMoney(b.refunded_minor, b.currency)}
                  </td>
                </tr>
              </tbody>
            </table>
            {payments.map((p) => (
              <p key={String(p.id)} className="admin-muted">
                {String(p.provider)} {p.livemode ? "LIVE" : "test"} · {String(p.status)} · {formatMoney(Number(p.amount_minor), String(p.currency))} ·{" "}
                {String(p.provider_payment_id || p.provider_session_id)}
              </p>
            ))}
          </section>
          {can(user.role, "bookings.manage") && staffMoves.length > 0 && (
            <section className="admin-card">
              <h2>Change status</h2>
              {staffMoves.map((to) => (
                <form key={to} action={changeBookingStatus} className="admin-form" style={{ marginBottom: 10 }}>
                  <input type="hidden" name="id" value={b.id} />
                  <input type="hidden" name="to" value={to} />
                  <input name="note" placeholder="Note (optional)" maxLength={500} />
                  <ConfirmButton variant={to === "cancelled" ? "danger" : "primary"} message={`Mark this booking as ${to}?`}>
                    Mark {STATUS_LABELS[to].en.toLowerCase()}
                  </ConfirmButton>
                </form>
              ))}
              {b.status === "paid" && <p className="admin-muted">Cancelling a paid booking does not refund automatically — use Refund below.</p>}
            </section>
          )}
          {can(user.role, "payments.refund") && refundable > 0 && (
            <section className="admin-card">
              <h2>Refund</h2>
              <form action={refund} className="admin-form">
                <input type="hidden" name="id" value={b.id} />
                <label>
                  Amount ({b.currency}) <small>max {refundable / 100}</small>
                  <input name="amount" type="number" min={1} step="any" max={refundable / 100} defaultValue={refundable / 100} required />
                </label>
                <label>
                  Reason
                  <input name="reason" required minLength={3} maxLength={300} />
                </label>
                <ConfirmButton message="Send this refund to the payment provider?">Refund</ConfirmButton>
              </form>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
