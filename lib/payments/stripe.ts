import "server-only";
import Stripe from "stripe";
import { HttpError } from "@/lib/hub/security";
import type { PaymentEvent, PaymentProvider } from "./types";

let client: Stripe | null = null;
function stripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new HttpError(503, "Online payment is not configured yet (STRIPE_SECRET_KEY).");
  // Test mode by default: a live key is refused unless the owner explicitly enables live payments.
  if (key.startsWith("sk_live_") && process.env.PAYMENTS_LIVE !== "true")
    throw new HttpError(503, "A live Stripe key is set but PAYMENTS_LIVE is not \"true\". Payments stay disabled for safety.");
  client ??= new Stripe(key, { timeout: 10000, maxNetworkRetries: 1 });
  return client;
}

export const stripeProvider: PaymentProvider = {
  id: "stripe",
  label: "Stripe Checkout",
  configured: () => !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_WEBHOOK_SECRET,
  testMode: () => !String(process.env.STRIPE_SECRET_KEY || "").startsWith("sk_live_"),
  async createCheckout(req) {
    try {
      const session = await stripe().checkout.sessions.create(
        {
          mode: "payment",
          customer_email: req.customerEmail,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: req.currency.toLowerCase(),
                unit_amount: req.amountMinor,
                product_data: { name: req.title, description: req.description.slice(0, 500) },
              },
            },
          ],
          metadata: { kind: "tour", bookingId: req.bookingId },
          payment_intent_data: { metadata: { kind: "tour", bookingId: req.bookingId } },
          success_url: req.successUrl,
          cancel_url: req.cancelUrl,
          expires_at: Math.floor(Date.now() / 1000) + Math.max(30, req.expiresInMinutes) * 60,
        },
        { idempotencyKey: req.idempotencyKey },
      );
      if (!session.url) throw new HttpError(503, "Stripe did not return a checkout page.");
      return { sessionId: session.id, url: session.url, livemode: session.livemode };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(503, "The payment provider is unavailable. Please try again.");
    }
  },
  async refund(paymentId, amountMinor, bookingId, reason) {
    const r = await stripe().refunds.create(
      { payment_intent: paymentId, amount: amountMinor, metadata: { kind: "tour", bookingId, reason: reason.slice(0, 200) } },
      { idempotencyKey: `refund:${bookingId}:${paymentId}:${amountMinor}` },
    );
    return { refundId: r.id, status: r.status || "pending" };
  },
};

/** Verifies the Stripe signature on the raw body. Throws on any mismatch. */
export function verifyStripeEvent(raw: string, signature: string): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new HttpError(503, "Webhook secret not configured.");
  return stripe().webhooks.constructEvent(raw, signature, secret);
}

const metaOf = (o: { metadata?: Stripe.Metadata | null }) => o.metadata || {};
export function isTourEvent(event: Stripe.Event) {
  const o = event.data.object as { metadata?: Stripe.Metadata | null };
  return metaOf(o).kind === "tour";
}

/** Normalises the Stripe events we care about into provider-neutral PaymentEvents. */
export function toPaymentEvent(event: Stripe.Event): PaymentEvent {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      if (s.payment_status !== "paid") return { kind: "ignored", eventId: event.id };
      return {
        kind: "paid",
        eventId: event.id,
        bookingId: String(metaOf(s).bookingId || ""),
        sessionId: s.id,
        paymentId: typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id || "",
        amountMinor: s.amount_total ?? 0,
        currency: (s.currency || "").toUpperCase(),
        livemode: s.livemode,
      };
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      const s = event.data.object;
      return {
        kind: event.type.endsWith("expired") ? "expired" : "failed",
        eventId: event.id,
        bookingId: String(metaOf(s).bookingId || ""),
        sessionId: s.id,
      };
    }
    case "refund.created":
    case "refund.updated": {
      const r = event.data.object;
      if (r.status !== "succeeded") return { kind: "ignored", eventId: event.id };
      return {
        kind: "refunded",
        eventId: event.id,
        bookingId: String(metaOf(r).bookingId || ""),
        paymentId: typeof r.payment_intent === "string" ? r.payment_intent : r.payment_intent?.id || "",
        amountMinor: r.amount,
        refundId: r.id,
      };
    }
    default:
      return { kind: "ignored", eventId: event.id };
  }
}
