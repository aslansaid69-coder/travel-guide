import {
  paymentEnriched,
  reconcileRefund,
  recordInvoice,
} from "@/lib/platform/commerce";
import { database } from "@/lib/db";
import { stripe } from "@/lib/hub/bookings";
import { paymentLink } from "@/lib/platform/store";
import { notify } from "@/lib/hub/store";
import { siteUrl } from "@/lib/site";
import { boundedBody } from "@/lib/updates/body";
import { isTourEvent, toPaymentEvent } from "@/lib/payments/stripe";
import { applyPaymentEvent } from "@/lib/tours/payments";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY)
    return Response.json(
      { error: "Payments not configured." },
      { status: 503 },
    );
  let event;
  try {
    const raw = await boundedBody(new Response(request.body), 1000000);
    event = stripe().webhooks.constructEvent(
      raw,
      request.headers.get("stripe-signature") || "",
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return Response.json(
      { error: "Invalid webhook signature." },
      { status: 400 },
    );
  }
  // Self-service tour bookings (metadata.kind = "tour") use the provider-neutral flow.
  if (isTourEvent(event)) {
    try {
      const outcome = await applyPaymentEvent("stripe", toPaymentEvent(event));
      return Response.json({ received: true, outcome });
    } catch {
      return Response.json({ error: "Tour payment reconciliation needs retry." }, { status: 500 });
    }
  }
  if (event.type === "invoice.paid" || event.type === "invoice.finalized") {
    try {
      await recordInvoice(event.data.object);
      return Response.json({ received: true });
    } catch {
      return Response.json(
        { error: "Invoice reconciliation needs retry." },
        { status: 500 },
      );
    }
  }
  if (
    ["refund.created", "refund.updated", "refund.failed"].includes(event.type)
  ) {
    try {
      await reconcileRefund(
        event.data.object as import("stripe").default.Refund,
      );
      return Response.json({ received: true });
    } catch {
      return Response.json(
        { error: "Refund reconciliation needs retry." },
        { status: 500 },
      );
    }
  }
  if (
    event.type === "checkout.session.async_payment_failed" ||
    event.type === "checkout.session.expired"
  ) {
    const session = event.data.object;
    await database()`UPDATE hub_payment_sessions SET status=${event.type.endsWith("expired") ? "expired" : "failed"} WHERE id=${session.id} AND status='created'`;
    return Response.json({ received: true });
  }
  if (
    event.type !== "checkout.session.completed" &&
    event.type !== "checkout.session.async_payment_succeeded"
  )
    return Response.json({ received: true });
  const session = event.data.object;
  if (session.payment_status !== "paid")
    return Response.json({ received: true });
  try {
    const sql = database();
    const result =
      await sql`SELECT hub_apply_payment(${event.id},${session.id},${session.amount_total || 0},${session.currency || ""}) AS status`;
    await paymentEnriched(session, stripe());
    const order = (
      await sql`SELECT r.id,r.guest,r.plan_id FROM hub_requests r JOIN hub_payment_sessions s ON s.request_id=r.id WHERE s.id=${session.id}`
    )[0];
    if (order) {
      await notify(
        `payment:${session.id}`,
        order.guest.email,
        result[0].status === "confirmed"
          ? "Your Almaty booking is confirmed"
          : "Your Almaty payment was received",
        `Payment received. Status: ${result[0].status}.\n${await paymentLink(order.id)}\nIf review is needed, our team will contact you.`,
      );
      if (process.env.ALERT_TO)
        await notify(
          `payment-owner:${session.id}`,
          process.env.ALERT_TO,
          "Almaty payment received",
          `Request ${order.id}. Status ${result[0].status}.\n${siteUrl}/admin/hub`,
        );
    }
    return Response.json({ received: true });
  } catch {
    return Response.json(
      { error: "Payment reconciliation needs retry." },
      { status: 500 },
    );
  }
}
