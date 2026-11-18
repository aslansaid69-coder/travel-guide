import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { database } from "@/lib/db";
import { stripe } from "@/lib/hub/bookings";
import { HttpError } from "@/lib/hub/security";
import { audit } from "@/lib/hub/store";
import { siteUrl } from "@/lib/site";
import { financialLease } from "./commerce";
import { ownedGuide, commerceSettings } from "./store";
export function connectAllowed(country: string) {
  return (
    process.env.STRIPE_CONNECT_ENABLED === "true" &&
    !!process.env.STRIPE_PLATFORM_COUNTRY &&
    (process.env.STRIPE_CONNECT_COUNTRIES || "").split(",").includes(country)
  );
}
export async function onboarding() {
  const { row, guide, staff } = await ownedGuide();
  if (!connectAllowed(guide.country))
    throw new HttpError(
      503,
      "Connect transfers are not enabled for this operator and guide country. The owner must verify Stripe eligibility using the actual registered countries.",
    );
  const service = stripe(),
    sql = database();
  let id = row.stripe_account;
  if (!id) {
    const account = await service.v2.core.accounts.create(
      {
        contact_email: guide.email,
        display_name: guide.name,
        dashboard: "express",
        identity: { country: guide.country, entity_type: "individual" },
        configuration: {
          recipient: {
            capabilities: {
              stripe_balance: { stripe_transfers: { requested: true } },
            },
          },
        },
        defaults: {
          responsibilities: {
            fees_collector: "application",
            losses_collector: "application",
          },
        },
        metadata: { guideId: row.id },
      },
      { idempotencyKey: `guide-account:${row.id}` },
    );
    id = account.id;
    await sql`UPDATE guides SET stripe_account=${id} WHERE id=${row.id}`;
  }
  const link = await service.v2.core.accountLinks.create({
    account: id,
    use_case: {
      type: "account_onboarding",
      account_onboarding: {
        refresh_url: `${siteUrl}/guide?connect=refresh`,
        return_url: `${siteUrl}/guide?connect=returned`,
      },
    },
  });
  await audit(staff.id, "guide.connect.onboard", row.id);
  return { url: link.url };
}
export async function connectStatus() {
  const { row } = await ownedGuide();
  if (!row.stripe_account) return { ready: false, status: "not-started" };
  const account = await stripe().v2.core.accounts.retrieve(row.stripe_account, {
    include: ["configuration.recipient"],
  });
  const ready =
    account.configuration?.recipient?.capabilities?.stripe_balance
      ?.stripe_transfers?.status === "active";
  await database()`UPDATE guides SET stripe_ready=${ready} WHERE id=${row.id}`;
  return { ready, status: ready ? "active" : "requirements-pending" };
}
export function guideNet(fee: number, commission: number) {
  return Math.floor((fee * (100 - commission)) / 100);
}
export async function releaseEarnings(
  assignmentId: string,
  actor: string,
  client?: Stripe,
) {
  const a = (
    await database()`SELECT request_id FROM guide_assignments WHERE id=${assignmentId}`
  )[0];
  if (!a) throw new HttpError(404, "Assignment not found.");
  return financialLease(a.request_id, () =>
    releaseEarningsLocked(assignmentId, actor, client),
  );
}
async function releaseEarningsLocked(
  assignmentId: string,
  actor: string,
  client?: Stripe,
) {
  const sql = database(),
    a = (
      await sql`SELECT a.*,g.stripe_account,g.status AS guide_status,g.data AS guide,r.status AS booking_status,r.paid_minor,r.payment_status,q.amount_minor,c.discount_minor,c.voucher_minor FROM guide_assignments a JOIN guides g ON g.id=a.guide_id JOIN hub_requests r ON r.id=a.request_id JOIN hub_quotes q ON q.id=r.quote_id LEFT JOIN platform_checkout c ON c.request_id=r.id WHERE a.id=${assignmentId}`
    )[0];
  const conf = await commerceSettings();
  if (
    !a ||
    !a.completion_approved ||
    a.status !== "completed" ||
    a.booking_status !== "completed" ||
    new Date(a.ends_at).valueOf() + conf.payoutDelayHours * 3600000 > Date.now()
  )
    throw new HttpError(
      409,
      "Earnings require manager-approved completion and the payout delay.",
    );
  if (
    a.guide_status === "removed" ||
    !a.stripe_account ||
    !connectAllowed(a.guide.country)
  )
    throw new HttpError(
      503,
      "Guide Connect eligibility or onboarding is not configured.",
    );
  if (
    Number(a.paid_minor) <
      Number(a.amount_minor) -
        Number(a.discount_minor || 0) -
        Number(a.voucher_minor || 0) ||
    !["paid", "deposit-paid"].includes(a.payment_status)
  )
    throw new HttpError(
      409,
      "The package must be fully settled in confirmed funds before a guide transfer.",
    );
  if (
    (
      await sql`SELECT id FROM platform_refunds WHERE request_id=${a.request_id} AND status NOT IN ('failed','succeeded')`
    )[0]
  )
    throw new HttpError(409, "Resolve the pending refund first.");
  const service = client || stripe(),
    account = await service.v2.core.accounts.retrieve(a.stripe_account, {
      include: ["configuration.recipient"],
    });
  if (
    account.configuration?.recipient?.capabilities?.stripe_balance
      ?.stripe_transfers?.status !== "active"
  )
    throw new HttpError(
      409,
      "Stripe has not enabled this guide’s transfer capability.",
    );
  const payments =
    await sql`SELECT p.*,COALESCE((SELECT sum(t.amount_minor-t.reversed_minor) FROM guide_transfers t WHERE t.payment_id=p.id AND t.assignment_id<>${assignmentId} AND t.status IN ('paid','pending','needs-review')),0) AS allocated_other FROM hub_payment_sessions p WHERE p.request_id=${a.request_id} AND p.status='paid' AND p.currency=${a.currency} AND p.charge_id IS NOT NULL ORDER BY p.created_at`;
  let remaining = guideNet(Number(a.fee_minor), Number(a.commission_percent));
  const transferred =
    await sql`SELECT COALESCE(sum(amount_minor-reversed_minor),0) AS total FROM guide_transfers WHERE assignment_id=${assignmentId} AND status='paid'`;
  remaining -= Number(transferred[0].total);
  if (remaining <= 0) return { ok: true, alreadyReleased: true };
  const balance = payments.reduce(
    (n, p) =>
      n +
      Math.max(
        0,
        Number(p.amount_minor) -
          Number(p.refunded_minor) -
          Number(p.allocated_other),
      ),
    0,
  );
  if (remaining > balance)
    throw new HttpError(
      409,
      "Insufficient card funds for this guide allocation. Voucher/cash earnings need manual accounting.",
    );
  for (const p of payments) {
    if (!remaining) break;
    const old = (
      await sql`SELECT * FROM guide_transfers WHERE assignment_id=${assignmentId} AND payment_id=${p.id}`
    )[0];
    if (old?.status === "paid") continue;
    const amount = Math.min(
      remaining,
      Number(p.amount_minor) -
        Number(p.refunded_minor) -
        Number(p.allocated_other),
    );
    if (amount <= 0) continue;
    const id = old?.id || randomUUID();
    await sql`INSERT INTO guide_transfers(id,assignment_id,payment_id,guide_id,amount_minor,currency) VALUES(${id},${assignmentId},${p.id},${a.guide_id},${amount},${a.currency}) ON CONFLICT(assignment_id,payment_id) DO NOTHING`;
    const saved = (
      await sql`SELECT * FROM guide_transfers WHERE assignment_id=${assignmentId} AND payment_id=${p.id}`
    )[0];
    try {
      const transfer = await service.transfers.create(
        {
          amount: Number(saved.amount_minor),
          currency: a.currency.toLowerCase(),
          destination: a.stripe_account,
          source_transaction: p.charge_id,
          transfer_group: `booking:${a.request_id}`,
          metadata: { assignmentId, ledgerId: saved.id },
        },
        { idempotencyKey: `guide-transfer:${saved.id}` },
      );
      await sql`UPDATE guide_transfers SET provider_id=${transfer.id},status='paid',last_error=NULL WHERE id=${saved.id}`;
      remaining -= Number(saved.amount_minor);
    } catch {
      await sql`UPDATE guide_transfers SET status='needs-review',last_error='Provider transfer could not be confirmed. Retry this ledger ID only.' WHERE id=${saved.id}`;
      throw new HttpError(
        502,
        "Transfer needs provider review; its ledger ID is retained for safe retry.",
      );
    }
  }
  await audit(actor, "guide.earnings.release", a.request_id, {
    assignment: assignmentId,
  });
  return { ok: true, remainingMinor: remaining };
}
