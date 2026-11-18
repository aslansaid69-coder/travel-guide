import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { database } from "@/lib/db";
import { siteUrl } from "@/lib/site";
import type { Guest, Plan, CatalogItem } from "./types";
import { estimate } from "./core";
import {
  assignedManager,
  catalog,
  getPlan,
  notify,
  settings,
  rates,
  privateLink,
} from "./store";
import { HttpError, hash } from "./security";
export const stripe = () => {
  if (!process.env.STRIPE_SECRET_KEY)
    throw new HttpError(
      503,
      "Online payments are not configured. Your manager can arrange pay on arrival.",
    );
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    timeout: 8000,
    maxNetworkRetries: 0,
  });
};
export async function planSlots(
  plan: Plan,
  items: CatalogItem[],
  requireAll = false,
) {
  const ids: string[] = [];
  const sql = database();
  for (let index = 0; index < plan.days.length; index++) {
    for (const stop of plan.days[index].stops) {
      const item = items.find((i) => i.id === stop.itemId);
      if (!item || item.status !== "approved" || item.closed)
        throw new HttpError(409, "A selected place is no longer available.");
      if (item.bookable && !stop.slotId && requireAll)
        throw new HttpError(409, `Choose an available slot for ${item.name}.`);
      if (stop.slotId) {
        const rows =
          await sql`SELECT item_id,starts_at,ends_at FROM hub_slots WHERE id=${stop.slotId} AND blackout=false`;
        if (!rows[0] || rows[0].item_id !== item.id)
          throw new HttpError(
            409,
            "A selected slot does not match its service.",
          );
        const at = new Date(plan.startDate + "T00:00:00+05:00");
        at.setUTCDate(at.getUTCDate() + index);
        at.setTime(
          at.valueOf() +
            (Number(stop.start.slice(0, 2)) * 60 +
              Number(stop.start.slice(3))) *
              60000,
        );
        if (
          Math.abs(new Date(rows[0].starts_at).valueOf() - at.valueOf()) > 60000
        )
          throw new HttpError(
            409,
            `The plan time must match the selected slot for ${item.name}.`,
          );
        if (
          stop.duration >
          (new Date(rows[0].ends_at).valueOf() -
            new Date(rows[0].starts_at).valueOf()) /
            60000
        )
          throw new HttpError(
            409,
            `The visit duration exceeds the slot for ${item.name}.`,
          );
        ids.push(stop.slotId);
      }
    }
  }
  if (new Set(ids).size !== ids.length)
    throw new HttpError(409, "A time slot is selected more than once.");
  return ids;
}
export async function createRequest(
  planId: string,
  guest: Guest,
  intent: string,
  key: string,
) {
  const sql = database();
  const existing =
    await sql`SELECT id,plan_id FROM hub_requests WHERE idempotency_key=${key}`;
  if (existing[0]) {
    if (existing[0].plan_id !== planId)
      throw new HttpError(409, "Request ID already used.");
    return { id: existing[0].id };
  }
  const { data: plan } = await getPlan(planId);
  if (!plan.days.some((d) => d.stops.length))
    throw new HttpError(400, "Add at least one stop before sending a request.");
  const items = await catalog();
  await planSlots(plan, items);
  const manager = await assignedManager(guest.language),
    id = randomUUID();
  const quote = estimate(plan, items, await settings(), await rates());
  await sql`INSERT INTO hub_requests(id,plan_id,guest,intent,assigned_to,idempotency_key) VALUES(${id},${planId},${JSON.stringify(guest)}::jsonb,${intent},${manager?.user_id || null},${key})`;
  await sql`INSERT INTO hub_messages(request_id,actor,visibility,body) VALUES(${id},'client','client',${guest.message || "New itinerary request."})`;
  await sql`UPDATE hub_plans SET email=${guest.email},reminder_consent=${guest.reminderConsent},marketing_consent=${guest.marketingConsent},last_seen=now() WHERE id=${planId}`;
  const link = await privateLink(planId);
  await notify(
    `request:${id}`,
    guest.email,
    "We received your Almaty itinerary",
    `Hello ${guest.name},\n\nOur team has received your ${intent} request for ${plan.adults + plan.children} guests. This is a request, not a confirmed booking.\n\nView your plan: ${link}\nKeep this private link to edit your plan and chat with the team.\n\nEstimate only; the final price is confirmed by our team.`,
  );
  const owner = manager?.email || process.env.ALERT_TO;
  if (owner)
    await notify(
      `manager:${id}`,
      owner,
      "New Almaty travel request",
      `Request ${id}\n${plan.adults + plan.children} guests · ${guest.language}\nPriced portion: ${quote.min / 100}–${quote.max / 100} KZT; ${quote.unknown} lines need confirmation.\n${siteUrl}/admin/hub`,
    );
  if (process.env.TELEGRAM_CHAT_ID)
    await notify(
      `telegram:${id}`,
      process.env.TELEGRAM_CHAT_ID,
      "New travel request",
      `New request ${id}. Open ${siteUrl}/admin/hub`,
      undefined,
      "telegram",
    );
  return { id };
}
export async function checkout(
  requestId: string,
  mode: "deposit" | "full",
  client?: Stripe,
) {
  const sql = database(),
    service = client || stripe(),
    owner = randomUUID();
  const claim =
    await sql`INSERT INTO hub_checkout_leases(request_id,owner,expires_at) VALUES(${requestId},${owner},now()+interval '90 seconds') ON CONFLICT(request_id) DO UPDATE SET owner=EXCLUDED.owner,expires_at=EXCLUDED.expires_at WHERE hub_checkout_leases.expires_at<now() RETURNING owner`;
  if (!claim.length)
    throw new HttpError(
      409,
      "A checkout is already being prepared. Please wait and retry.",
    );
  try {
    return await prepareCheckout(requestId, mode, service);
  } finally {
    await sql`DELETE FROM hub_checkout_leases WHERE request_id=${requestId} AND owner=${owner}`;
  }
}
async function prepareCheckout(
  requestId: string,
  mode: "deposit" | "full",
  service: Stripe,
) {
  const sql = database();
  const r = (
    await sql`SELECT r.*,q.amount_minor,q.currency AS quote_currency,q.deposit_percent,q.status AS quote_status,q.plan_version,q.expires_at,q.plan AS quote_plan FROM hub_requests r JOIN hub_quotes q ON q.id=r.quote_id WHERE r.id=${requestId}`
  )[0];
  if (
    !r ||
    r.status === "cancelled" ||
    r.quote_status !== "approved" ||
    (new Date(r.expires_at).valueOf() < Date.now() &&
      !["confirmed", "completed"].includes(r.status))
  )
    throw new HttpError(409, "Approve a current final quote before paying.");
  const p = await getPlan(r.plan_id);
  if (p.version !== r.plan_version)
    throw new HttpError(
      409,
      "Your plan changed. Ask the manager for a new quote.",
    );
  const { total, revision } = await (
    await import("@/lib/platform/commerce")
  ).requireCheckout(requestId);
  const due =
    mode === "deposit"
      ? Math.ceil((total * Number(r.deposit_percent)) / 100)
      : total;
  const amount = Math.max(0, due - Number(r.paid_minor));
  if (!amount) throw new HttpError(409, "This amount has already been paid.");
  const existing =
    await sql`SELECT id,quote_id,amount_minor FROM hub_payment_sessions WHERE request_id=${requestId} AND status='created' ORDER BY created_at DESC LIMIT 10`;
  for (const saved of existing) {
    const old = await service.checkout.sessions.retrieve(saved.id);
    if (old.status === "complete")
      throw new HttpError(
        409,
        "A payment is being verified. Wait for confirmation before starting another checkout.",
      );
    if (old.status === "open") {
      if (
        saved.quote_id === r.quote_id &&
        Number(saved.amount_minor) === amount
      )
        return { url: old.url };
      await service.checkout.sessions.expire(saved.id);
    }
    await sql`UPDATE hub_payment_sessions SET status='expired' WHERE id=${saved.id} AND status='created'`;
  }
  // An established package can settle its balance after the tour. Its existing
  // reservation must not be released/re-created or checked as a new past slot.
  if (!["confirmed", "completed"].includes(r.status)) {
    const items = await catalog();
    const selected = await planSlots(r.quote_plan, items, true);
    await sql`SELECT hub_reserve(${requestId},${JSON.stringify(selected)}::jsonb,${r.quote_plan.adults + r.quote_plan.children},false)`;
  }
  const bucket = Math.floor(Date.now() / 1800000),
    invoiceEnabled = process.env.STRIPE_INVOICE_ENABLED === "true",
    paymentReference = hash(
      `checkout:${requestId}:${r.quote_id}:${mode}:${Number(r.paid_minor)}:${total}:${bucket}:${revision}:${invoiceEnabled}`,
    );
  const session = await service.checkout.sessions.create(
    {
      mode: "payment",
      client_reference_id: requestId,
      metadata: { requestId, quoteId: r.quote_id },
      payment_intent_data: {
        transfer_group: `booking:${requestId}`,
        metadata: { requestId, quoteId: r.quote_id },
      },
      customer_email: r.guest.email,
      // Optional paid-invoice creation has separate provider fees. Enable only
      // after configuring the operator's legal/tax details in Stripe.
      ...(invoiceEnabled
        ? {
            customer_creation: "always" as const,
            billing_address_collection: "required" as const,
            invoice_creation: {
              enabled: true,
              invoice_data: {
                metadata: { requestId, quoteId: r.quote_id, paymentReference },
                description: `Almaty booking ${requestId}: ${mode === "deposit" ? "deposit" : "payment / balance"}. This invoice covers this card payment only.`,
              },
            },
          }
        : {}),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: r.quote_currency.toLowerCase(),
            unit_amount: amount,
            product_data: {
              name: `Almaty itinerary ${mode === "deposit" ? "deposit" : "payment"}`,
              description:
                "One package. Subject to the approved quote and terms.",
            },
          },
        },
      ],
      expires_at: Math.floor(Date.now() / 1000) + 1800,
      success_url: `${siteUrl}/payment/${requestId}?plan=${r.plan_id}`,
      cancel_url: `${siteUrl}/checkout/${requestId}?plan=${r.plan_id}&payment=cancelled`,
    },
    {
      idempotencyKey: `checkout:${paymentReference}`,
    },
  );
  await sql`INSERT INTO hub_payment_sessions(id,request_id,quote_id,amount_minor,currency,invoice_reference) VALUES(${session.id},${requestId},${r.quote_id},${amount},${r.quote_currency},${invoiceEnabled ? paymentReference : null}) ON CONFLICT DO NOTHING`;
  return { url: session.url };
}
export async function confirmArrival(
  requestId: string,
  paymentRequirementMet = false,
) {
  const sql = database();
  if (!paymentRequirementMet && !(await settings()).payOnArrival)
    throw new HttpError(409, "Pay on arrival is disabled.");
  const r = (
    await sql`SELECT r.*,q.plan,q.status AS quote_status,q.expires_at,q.plan_version FROM hub_requests r JOIN hub_quotes q ON q.id=r.quote_id WHERE r.id=${requestId}`
  )[0];
  if (
    !r ||
    r.status === "cancelled" ||
    r.quote_status !== "approved" ||
    new Date(r.expires_at).valueOf() < Date.now()
  )
    throw new HttpError(409, "Approve a current final quote first.");
  if ((await getPlan(r.plan_id)).version !== r.plan_version)
    throw new HttpError(409, "The plan changed; request an updated quote.");
  const slots = await planSlots(r.plan, await catalog(), true);
  await sql.transaction([
    sql`SELECT hub_reserve(${requestId},${JSON.stringify(slots)}::jsonb,${r.plan.adults + r.plan.children},true)`,
    sql`UPDATE hub_requests SET status='confirmed',payment_status='pay-on-arrival',updated_at=now() WHERE id=${requestId}`,
  ]);
  await notify(
    `arrival:${requestId}:${r.quote_id}`,
    r.guest.email,
    "Your Almaty booking is confirmed",
    `${paymentRequirementMet ? "Your booking is confirmed using recorded payments or credit. Review any remaining balance on your private booking page." : "Your pay-on-arrival booking is confirmed."}\n${siteUrl}/trip/${r.plan_id}\nPlease use your private plan link to contact the team.`,
  );
  return { ok: true };
}
