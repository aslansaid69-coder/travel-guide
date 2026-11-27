import "server-only";
import { randomUUID } from "node:crypto";
import { database } from "@/lib/db";
import { HttpError } from "@/lib/hub/security";
import { notify } from "@/lib/hub/store";
import { siteUrl } from "@/lib/site";
import { paymentProvider } from "@/lib/payments";
import type { PaymentEvent } from "@/lib/payments/types";
import { canTransition, BOOKING_STATUSES, type BookingStatus } from "./status";
import { getBooking, type BookingRow } from "./service";

/**
 * Atomically moves a booking to `to` if its current status allows it, and logs the change.
 * Returns the previous status, or null when the transition was not allowed / already applied.
 */
export async function transition(
  bookingId: string,
  to: BookingStatus,
  actor: string,
  note = "",
): Promise<BookingStatus | null> {
  const from = BOOKING_STATUSES.filter((s) => canTransition(s, to));
  if (!from.length) return null;
  const rows = await database()`
    WITH prev AS (SELECT id, status FROM tour_bookings WHERE id=${bookingId} AND status = ANY(${from as string[]}::text[]) FOR UPDATE),
    upd AS (
      UPDATE tour_bookings b SET status=${to}, updated_at=now(), version=b.version+1,
        paid_at = CASE WHEN ${to}='paid' THEN now() ELSE b.paid_at END,
        confirmed_at = CASE WHEN ${to}='confirmed' THEN now() ELSE b.confirmed_at END,
        completed_at = CASE WHEN ${to}='completed' THEN now() ELSE b.completed_at END,
        cancelled_at = CASE WHEN ${to}='cancelled' THEN now() ELSE b.cancelled_at END,
        expires_at = CASE WHEN ${to}<>'pending' THEN NULL ELSE b.expires_at END
      FROM prev WHERE b.id = prev.id RETURNING prev.status AS old
    ),
    ev AS (INSERT INTO tour_booking_events(booking_id,from_status,to_status,actor,note) SELECT ${bookingId}, old, ${to}, ${actor}, ${note} FROM upd RETURNING from_status)
    SELECT from_status FROM ev`;
  return (rows[0]?.from_status as BookingStatus | undefined) ?? null;
}

/** Starts (or resumes) online payment of the booking's prepayment. */
export async function startCheckout(booking: BookingRow, user: { id: string; email: string }) {
  if (booking.user_id !== user.id) throw new HttpError(404, "Booking not found.");
  if (booking.status !== "pending") throw new HttpError(409, "This booking no longer needs payment.");
  if (booking.expires_at && new Date(booking.expires_at) < new Date())
    throw new HttpError(409, "This booking hold has expired. Please build the tour again so we can re-check the guide's calendar.");
  const provider = paymentProvider();
  if (!provider.configured())
    throw new HttpError(503, "Online payment is not available yet. Our team will contact you to arrange payment.");
  const sql = database();
  const open = (
    await sql`SELECT id,checkout_url FROM tour_payments WHERE booking_id=${booking.id} AND status='created' AND created_at > now() - interval '25 minutes' ORDER BY created_at DESC LIMIT 1`
  )[0];
  if (open?.checkout_url) return { url: String(open.checkout_url) };
  const paymentId = `tp_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const session = await provider.createCheckout({
    bookingId: booking.id,
    amountMinor: booking.amount_due_minor,
    currency: booking.currency,
    title: `Almaty tour · ${booking.start_date}`,
    description: `Prepayment for a ${booking.days}-day tour (${booking.place_ids.length} places, ${booking.adults + booking.children} travellers). The remaining amount is settled after the trip.`,
    customerEmail: booking.email,
    successUrl: `${siteUrl}/bookings/${booking.id}?paid=1`,
    cancelUrl: `${siteUrl}/bookings/${booking.id}?cancelled=1`,
    idempotencyKey: `checkout:${paymentId}`,
    expiresInMinutes: 30,
  });
  await sql`INSERT INTO tour_payments(id,booking_id,provider,provider_session_id,amount_minor,currency,status,livemode,checkout_url) VALUES(${paymentId},${booking.id},${provider.id},${session.sessionId},${booking.amount_due_minor},${booking.currency},'created',${session.livemode},${session.url})`;
  return { url: session.url };
}

/**
 * Applies a verified provider event exactly once (payment_events primary key).
 * Amount and currency must match what we asked for; anything else is left for staff review.
 */
export async function applyPaymentEvent(provider: string, e: PaymentEvent) {
  if (e.kind === "ignored") return "ignored";
  const sql = database();
  const first = await sql`INSERT INTO payment_events(provider,event_id,type,booking_id) VALUES(${provider},${e.eventId},${e.kind},${e.bookingId}) ON CONFLICT DO NOTHING RETURNING event_id`;
  if (!first.length) return "duplicate";
  try {
    if (e.kind === "paid") {
      const payment = (
        await sql`SELECT id,amount_minor,currency,status FROM tour_payments WHERE provider=${provider} AND provider_session_id=${e.sessionId} AND booking_id=${e.bookingId}`
      )[0];
      if (!payment) return "unknown-session";
      if (Number(payment.amount_minor) !== e.amountMinor || String(payment.currency) !== e.currency) {
        await sql`UPDATE tour_payments SET status='failed',updated_at=now() WHERE id=${payment.id}`;
        await transitionNote(e.bookingId, "Payment amount/currency mismatch — staff review required.");
        return "mismatch";
      }
      await sql`UPDATE tour_payments SET status='paid',provider_payment_id=${e.paymentId},receipt_url=${e.receiptUrl || null},livemode=${e.livemode},updated_at=now() WHERE id=${payment.id} AND status='created'`;
      await sql`UPDATE tour_bookings SET paid_minor=paid_minor+${e.amountMinor} WHERE id=${e.bookingId}`;
      const prev = await transition(e.bookingId, "paid", `webhook:${provider}`, `Payment ${e.paymentId}`);
      const b = await getBooking(e.bookingId);
      if (b) {
        await notify(
          `tour-paid:${b.id}`,
          b.email,
          "Your Almaty tour payment was received",
          `Thank you! We received your prepayment for the tour starting ${b.start_date}. Your guide will confirm shortly.\n${siteUrl}/bookings/${b.id}`,
        ).catch(() => {});
        if (process.env.ALERT_TO)
          await notify(`tour-paid-owner:${b.id}`, process.env.ALERT_TO, "New paid tour booking", `${b.id} · ${b.start_date}\n${siteUrl}/admin/bookings/${b.id}`).catch(() => {});
      }
      return prev ? "paid" : "already-paid";
    }
    if (e.kind === "failed" || e.kind === "expired") {
      await sql`UPDATE tour_payments SET status=${e.kind},updated_at=now() WHERE provider=${provider} AND provider_session_id=${e.sessionId} AND status='created'`;
      return e.kind;
    }
    if (e.kind === "refunded") {
      await sql`UPDATE tour_payments SET refunded_minor=LEAST(amount_minor, refunded_minor+${e.amountMinor}), status=CASE WHEN refunded_minor+${e.amountMinor} >= amount_minor THEN 'refunded' ELSE 'partially_refunded' END, updated_at=now() WHERE provider=${provider} AND provider_payment_id=${e.paymentId}`;
      await sql`UPDATE tour_bookings SET refunded_minor=LEAST(paid_minor, refunded_minor+${e.amountMinor}) WHERE id=${e.bookingId}`;
      const b = await getBooking(e.bookingId);
      if (b && b.refunded_minor >= b.paid_minor && b.paid_minor > 0)
        await transition(e.bookingId, "refunded", `webhook:${provider}`, `Refund ${e.refundId}`);
      return "refunded";
    }
  } catch (error) {
    // Let the provider retry: forget the event so the retry is processed.
    await sql`DELETE FROM payment_events WHERE provider=${provider} AND event_id=${e.eventId}`;
    throw error;
  }
  return "ignored";
}

async function transitionNote(bookingId: string, note: string) {
  await database()`INSERT INTO tour_booking_events(booking_id,from_status,to_status,actor,note) SELECT id,status,status,'system',${note} FROM tour_bookings WHERE id=${bookingId}`;
}

/** Staff refund of what was paid (minus already refunded). The webhook finalises the status. */
export async function refundBooking(bookingId: string, amountMinor: number, reason: string, actor: string) {
  const sql = database();
  const b = await getBooking(bookingId);
  if (!b) throw new HttpError(404, "Booking not found.");
  const refundable = b.paid_minor - b.refunded_minor;
  if (refundable <= 0) throw new HttpError(409, "Nothing left to refund.");
  if (amountMinor <= 0 || amountMinor > refundable) throw new HttpError(400, `Refund must be between 1 and ${refundable / 100}.`);
  const payment = (
    await sql`SELECT provider_payment_id,provider FROM tour_payments WHERE booking_id=${bookingId} AND status IN ('paid','partially_refunded') ORDER BY created_at DESC LIMIT 1`
  )[0];
  if (!payment?.provider_payment_id) throw new HttpError(409, "No card payment to refund. Record cash refunds outside the system.");
  const result = await paymentProvider().refund(String(payment.provider_payment_id), amountMinor, bookingId, reason);
  await transitionNote(bookingId, `Refund ${result.refundId} requested by ${actor} (${amountMinor / 100}): ${reason}`);
  return result;
}
