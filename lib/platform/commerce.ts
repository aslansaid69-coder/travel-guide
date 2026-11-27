import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { database } from "@/lib/db";
import { stripe, checkout, confirmArrival } from "@/lib/hub/bookings";
import { notify, audit } from "@/lib/hub/store";
import { HttpError, hash } from "@/lib/hub/security";
import { commerceSettings, notifyBooking, paymentLink } from "./store";
import type { CommerceSettings } from "./types";
export function quoteTerms(
  total: number,
  c: CommerceSettings,
  currency: string,
) {
  const fee = Math.min(total, c.feeMinor),
    tax = Math.round(((total - fee) * c.taxBps) / (10000 + c.taxBps));
  return {
    subtotalMinor: total - fee - tax,
    taxMinor: tax,
    feeMinor: fee,
    totalMinor: total,
    currency,
    taxLabel: c.taxLabel,
    taxBps: c.taxBps,
    freeCancellationHours: c.freeCancellationHours,
    lateRefundPercent: c.lateRefundPercent,
    clientTerms: c.clientTerms,
    version: hash(
      c.clientTerms +
        JSON.stringify([c.freeCancellationHours, c.lateRefundPercent]),
    ),
    createdAt: new Date().toISOString(),
  };
}
export function cancellationRefund(
  paid: number,
  start: string,
  now: number,
  policy: { freeCancellationHours: number; lateRefundPercent: number },
) {
  return now <=
    new Date(start).valueOf() - policy.freeCancellationHours * 3600000
    ? paid
    : Math.floor((paid * policy.lateRefundPercent) / 100);
}
export async function financialLease<T>(id: string, run: () => Promise<T>) {
  const sql = database(),
    owner = randomUUID();
  const row =
    await sql`INSERT INTO hub_checkout_leases(request_id,owner,expires_at) VALUES(${id},${owner},now()+interval '90 seconds') ON CONFLICT(request_id) DO UPDATE SET owner=EXCLUDED.owner,expires_at=EXCLUDED.expires_at WHERE hub_checkout_leases.expires_at<now() RETURNING owner`;
  if (!row.length)
    throw new HttpError(
      409,
      "Another payment action is in progress. Please wait and retry.",
    );
  try {
    return await run();
  } finally {
    await sql`DELETE FROM hub_checkout_leases WHERE request_id=${id} AND owner=${owner}`;
  }
}
export async function netAmount(id: string) {
  const sql = database(),
    r = (
      await sql`SELECT r.*,q.amount_minor,q.currency AS quote_currency,q.plan AS quote_plan,q.deposit_percent,q.status AS quote_status FROM hub_requests r JOIN hub_quotes q ON q.id=r.quote_id WHERE r.id=${id}`
    )[0];
  if (!r) throw new HttpError(409, "Ask the manager for a final quote.");
  const c = (
    await sql`SELECT * FROM platform_checkout WHERE request_id=${id}`
  )[0];
  return {
    row: r,
    total: Math.max(
      0,
      Number(r.amount_minor) -
        Number(c?.discount_minor || 0) -
        Number(c?.voucher_minor || 0),
    ),
    discount: Number(c?.discount_minor || 0),
    voucher: Number(c?.voucher_minor || 0),
    revision: String(c?.updated_at || r.quote_id),
  };
}
export async function acceptCheckout(
  id: string,
  userId: string,
  termsVersion: string,
  promo: string,
  voucher: string,
) {
  return financialLease(id, async () => {
    const sql = database(),
      { row: r } = await netAmount(id),
      terms =
        (
          await sql`SELECT data FROM platform_quote_terms WHERE quote_id=${r.quote_id}`
        )[0]?.data ||
        quoteTerms(
          Number(r.amount_minor),
          await commerceSettings(),
          r.quote_currency,
        );
    if (terms.version !== termsVersion)
      throw new HttpError(
        409,
        "Terms changed. Review the current terms before accepting.",
      );
    if (r.quote_status === "superseded" || r.status === "cancelled")
      throw new HttpError(409, "Quote unavailable.");
    if (
      Number(r.paid_minor) > 0 ||
      ["confirmed", "completed"].includes(r.status)
    ) {
      const current = (
        await sql`SELECT * FROM platform_checkout WHERE request_id=${id}`
      )[0];
      if (
        (current?.promo_code || "") !== promo ||
        (current?.voucher_code || "") !== voucher
      )
        throw new HttpError(
          409,
          "Codes cannot change after confirmation or payment. Ask the travel desk to adjust the quote.",
        );
    }
    const sessions =
      await sql`SELECT id FROM hub_payment_sessions WHERE request_id=${id} AND status='created'`;
    if (sessions.length) {
      const service = stripe();
      for (const s of sessions) {
        const old = await service.checkout.sessions.retrieve(s.id);
        if (old.status === "complete")
          throw new HttpError(409, "A payment is being verified.");
        if (old.status === "open") await service.checkout.sessions.expire(s.id);
        await sql`UPDATE hub_payment_sessions SET status='expired' WHERE id=${s.id} AND status='created'`;
      }
    }
    await sql.transaction([
      sql`UPDATE platform_redemptions SET status='released' WHERE request_id=${id} AND status='held'`,
      sql`INSERT INTO platform_checkout(request_id,promo_code,voucher_code,terms_version,terms_accepted_at) VALUES(${id},${promo || null},${voucher || null},${termsVersion},now()) ON CONFLICT(request_id) DO UPDATE SET promo_code=EXCLUDED.promo_code,voucher_code=EXCLUDED.voucher_code,terms_version=EXCLUDED.terms_version,terms_accepted_at=now(),updated_at=now()`,
    ]);
    let discount;
    try {
      discount = (
        await sql`SELECT platform_lock_discounts(${id},${Number(r.amount_minor)},${r.quote_currency},${userId}) AS value`
      )[0].value;
    } catch {
      throw new HttpError(
        409,
        "A code is expired, already reserved, has no balance, or requires its verified recipient account.",
      );
    }
    await audit(userId || "client", "checkout.accept", id, {
      termsVersion,
      promo: !!promo,
      voucher: !!voucher,
    });
    return discount;
  });
}
export async function requireCheckout(id: string) {
  const sql = database(),
    { row: r } = await netAmount(id),
    c = (await sql`SELECT * FROM platform_checkout WHERE request_id=${id}`)[0],
    terms =
      (
        await sql`SELECT data FROM platform_quote_terms WHERE quote_id=${r.quote_id}`
      )[0]?.data ||
      quoteTerms(
        Number(r.amount_minor),
        await commerceSettings(),
        r.quote_currency,
      );
  if (!c?.terms_accepted_at || c.terms_version !== terms.version)
    throw new HttpError(409, "Review and accept checkout terms first.");
  const invalid = (
    await sql`SELECT c.request_id FROM platform_checkout c WHERE c.request_id=${id} AND EXISTS(SELECT 1 FROM unnest(array_remove(ARRAY[c.promo_code,c.voucher_code],NULL)) AS candidate(value) WHERE NOT EXISTS(SELECT 1 FROM platform_redemptions d WHERE d.request_id=c.request_id AND d.code=candidate.value AND (d.status='applied' OR d.status='held' AND d.expires_at>now() AND d.quote_id=${r.quote_id})))`
  )[0];
  if (invalid)
    throw new HttpError(
      409,
      "Your code reservation expired. Apply the codes again.",
    );
  return netAmount(id);
}
export async function pay(id: string, mode: "full" | "deposit" | "arrival") {
  const n = await requireCheckout(id);
  const target =
    mode === "deposit"
      ? Math.ceil((n.total * Number(n.row.deposit_percent)) / 100)
      : n.total;
  if (
    ["confirmed", "completed"].includes(n.row.status) &&
    target <= Number(n.row.paid_minor)
  )
    return { url: `/payment/${id}?plan=${n.row.plan_id}` };
  if (mode === "arrival" || target <= Number(n.row.paid_minor)) {
    return financialLease(id, async () => {
      const sql = database(),
        again = await requireCheckout(id);
      const required =
        mode === "deposit"
          ? Math.ceil((again.total * Number(again.row.deposit_percent)) / 100)
          : again.total;
      if (required > Number(again.row.paid_minor) && mode !== "arrival")
        throw new HttpError(409, "The amount changed.");
      await confirmArrival(id, required <= Number(again.row.paid_minor));
      const applied = (
        await database()`SELECT platform_apply_discounts(${id}) AS ok`
      )[0].ok;
      if (!applied) throw new HttpError(409, "A code needs manager review.");
      if (again.total === 0)
        await sql`UPDATE hub_requests SET payment_status='voucher-paid' WHERE id=${id}`;
      else if (Number(again.row.paid_minor) >= again.total)
        await sql`UPDATE hub_requests SET payment_status=CASE WHEN EXISTS(SELECT 1 FROM platform_cash WHERE request_id=${id}) THEN 'cash-paid' ELSE 'paid' END WHERE id=${id}`;
      else if (Number(again.row.paid_minor) > 0)
        await sql`UPDATE hub_requests SET payment_status=CASE WHEN EXISTS(SELECT 1 FROM platform_cash WHERE request_id=${id}) THEN 'cash-deposit' ELSE 'deposit-paid' END WHERE id=${id}`;
      await notifyBooking(
        id,
        `checkout-arrival:${n.row.quote_id}`,
        "Your Almaty booking is confirmed",
        again.total === 0
          ? "Your package is covered by the accepted discounts and voucher."
          : Number(again.row.paid_minor) >= again.total
            ? "Your accepted package is covered by the recorded payments; no additional payment is due."
            : required <= Number(again.row.paid_minor)
              ? "Your recorded deposit covers this accepted quote. The remaining balance stays due under its terms."
              : "Your pay-on-arrival booking is confirmed.",
      );
      return { url: `/payment/${id}?plan=${n.row.plan_id}` };
    });
  }
  return checkout(id, mode);
}
export async function sendPaymentLink(id: string, actor: string) {
  const sql = database(),
    r = (await sql`SELECT guest FROM hub_requests WHERE id=${id}`)[0];
  if (!r) throw new HttpError(404, "Booking not found.");
  const url = await paymentLink(id);
  await notify(
    `pay-link:${id}:${randomUUID()}`,
    r.guest.email,
    "Review your Almaty package and payment",
    `Review the current quote, accept the terms and choose deposit, full payment or pay on arrival where offered:\n${url}\nKeep this private link to yourself.`,
  );
  await audit(actor, "payment.link", id);
  return {
    url,
    whatsapp: `https://wa.me/?text=${encodeURIComponent("Your private Almaty quote and payment link: " + url)}`,
    delivery: "queued",
  };
}
export async function recordInvoice(
  invoice: Stripe.Invoice,
  sessionId?: string,
) {
  if (invoice.status !== "paid") return false;
  const sql = database(),
    reference = invoice.metadata?.paymentReference;
  if (!reference) return false;
  const row = (
    await sql`SELECT * FROM hub_payment_sessions WHERE invoice_reference=${reference}`
  )[0];
  // A fast provider event may arrive before the Checkout create response is
  // saved. Retry signed events for our own requests rather than losing them.
  if (!row) {
    if (
      invoice.metadata?.requestId &&
      (
        await sql`SELECT id FROM hub_requests WHERE id=${invoice.metadata.requestId}`
      )[0]
    )
      throw new HttpError(503, "Invoice is awaiting its payment session.");
    return false;
  }
  if (
    (sessionId && row.id !== sessionId) ||
    row.request_id !== invoice.metadata?.requestId ||
    row.quote_id !== invoice.metadata?.quoteId ||
    Number(row.amount_minor) !== invoice.total ||
    invoice.amount_paid !== invoice.total ||
    row.currency.toLowerCase() !== invoice.currency?.toLowerCase() ||
    (row.invoice_id && row.invoice_id !== invoice.id)
  )
    throw new HttpError(
      409,
      "Invoice does not match its recorded card payment.",
    );
  const safe = (value?: string | null) => {
    try {
      const url = new URL(value || "");
      return url.protocol === "https:" &&
        (url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com"))
        ? url.href
        : null;
    } catch {
      return null;
    }
  };
  await sql`UPDATE hub_payment_sessions SET invoice_id=${invoice.id},invoice_url=COALESCE(${safe(invoice.invoice_pdf)},invoice_url),invoice_hosted_url=COALESCE(${safe(invoice.hosted_invoice_url)},invoice_hosted_url),invoice_number=${invoice.number || null} WHERE id=${row.id}`;
  // Invoice events enrich documents only. Only the signed checkout payment
  // event may credit funds and confirm a booking.
  return true;
}
export async function paymentEnriched(
  session: Stripe.Checkout.Session,
  service: Stripe,
) {
  const sql = database(),
    r = (
      await sql`SELECT * FROM hub_payment_sessions WHERE id=${session.id}`
    )[0];
  if (!r) return;
  if (session.invoice) {
    const invoice =
      typeof session.invoice === "string"
        ? await service.invoices.retrieve(session.invoice)
        : session.invoice;
    await recordInvoice(invoice, session.id);
  }
  const intent: Stripe.PaymentIntent | null =
    typeof session.payment_intent === "string"
      ? await service.paymentIntents.retrieve(session.payment_intent, {
          expand: ["latest_charge"],
        })
      : session.payment_intent;
  const charge =
    intent?.latest_charge && typeof intent.latest_charge !== "string"
      ? intent.latest_charge
      : null;
  await sql`UPDATE hub_payment_sessions SET payment_intent=${intent?.id || null},charge_id=${typeof intent?.latest_charge === "string" ? intent.latest_charge : charge?.id || null},receipt_url=${charge?.receipt_url || null} WHERE id=${session.id}`;
  const n = await netAmount(r.request_id);
  // A late or duplicate provider delivery must not reopen a cancelled package,
  // consume expired credit, or overwrite an already reconciled refund status.
  const applied =
    ["confirmed", "completed"].includes(n.row.status) &&
    ["paid", "deposit-paid"].includes(n.row.payment_status)
      ? (await sql`SELECT platform_apply_discounts(${r.request_id}) AS ok`)[0]
          .ok
      : false;
  if (
    applied &&
    !["refund-review", "capacity-review", "pricing-review"].includes(
      n.row.payment_status,
    )
  )
    await sql`UPDATE hub_requests SET payment_status=${Number(n.row.paid_minor) >= n.total ? "paid" : "deposit-paid"} WHERE id=${r.request_id}`;
  const data = {
    number: `${(await commerceSettings()).invoicePrefix}-${session.id.slice(-12).toUpperCase()}`,
    amountMinor: Number(r.amount_minor),
    currency: r.currency,
    paidAt: new Date().toISOString(),
    providerReceipt: charge?.receipt_url || null,
    operatorTaxId: (await commerceSettings()).operatorTaxId,
  };
  await sql`INSERT INTO platform_documents(id,request_id,payment_id,kind,data) VALUES(${randomUUID()},${r.request_id},${r.id},'payment-acknowledgment',${JSON.stringify(data)}::jsonb) ON CONFLICT(payment_id) DO NOTHING`;
}
export async function cancelRefund(
  id: string,
  actor: string,
  reason: string,
  service?: Stripe,
) {
  return financialLease(id, async () => {
    const sql = database(),
      n = await netAmount(id),
      r = n.row,
      c =
        (
          await sql`SELECT data FROM platform_quote_terms WHERE quote_id=${r.quote_id}`
        )[0]?.data ||
        quoteTerms(
          Number(r.amount_minor),
          await commerceSettings(),
          r.quote_currency,
        );
    if (r.status === "cancelled" && r.payment_status !== "refund-review")
      throw new HttpError(
        409,
        "This package is already cancelled. Review its refund ledger.",
      );
    const contract = (
      await sql`SELECT * FROM hub_quotes WHERE request_id=${id} AND (approved_at IS NOT NULL OR status='approved') ORDER BY COALESCE(approved_at,created_at) DESC LIMIT 1`
    )[0];
    if (!contract && Number(r.paid_minor) > 0)
      throw new HttpError(
        409,
        "The accepted contract needs reconciliation before a refund.",
      );
    const contractTerms = contract
      ? (
          await sql`SELECT data FROM platform_quote_terms WHERE quote_id=${contract.id}`
        )[0]?.data
      : null;
    if (contract && !contractTerms && Number(r.paid_minor) > 0)
      throw new HttpError(
        409,
        "This legacy quote needs a manual cancellation-policy review before refunding.",
      );
    const policy = contractTerms || c;
    const start =
      (contract?.plan || r.quote_plan).startDate + "T00:00:00+05:00";
    const payments =
      await sql`SELECT * FROM hub_payment_sessions WHERE request_id=${id} AND status='paid' ORDER BY created_at`;
    const pending =
      await sql`SELECT id FROM platform_refunds WHERE request_id=${id} AND status IN ('requested','pending','needs-review')`;
    if (pending.length)
      throw new HttpError(
        409,
        "A refund is pending. Reconcile it before starting another.",
      );
    let remaining = cancellationRefund(
        Number(r.paid_minor),
        start,
        r.cancelled_at ? new Date(r.cancelled_at).valueOf() : Date.now(),
        policy,
      ),
      requested = 0;
    const cashPaid = Number(
      (
        await sql`SELECT COALESCE(sum(amount_minor),0) AS total FROM platform_cash WHERE request_id=${id}`
      )[0].total,
    );
    if (remaining > 0 && !payments.length && cashPaid <= 0)
      throw new HttpError(
        409,
        "Payment details need reconciliation before a refund.",
      );
    const provider =
      remaining > 0 && payments.length ? service || stripe() : null;
    for (const p of payments) {
      const amount = Math.min(
        remaining,
        Number(p.amount_minor) - Number(p.refunded_minor),
      );
      if (amount <= 0) continue;
      if (!p.payment_intent)
        throw new HttpError(
          409,
          "Payment details need webhook reconciliation before refund.",
        );
      const refundId = randomUUID();
      await sql`INSERT INTO platform_refunds(id,request_id,payment_id,amount_minor,status,reason,actor) VALUES(${refundId},${id},${p.id},${amount},'requested',${reason},${actor})`;
      try {
        const transfers =
          await sql`SELECT * FROM guide_transfers WHERE payment_id=${p.id} AND status='paid' AND amount_minor>reversed_minor`;
        for (const t of transfers) {
          const reverse = Math.min(
            Number(t.amount_minor) - Number(t.reversed_minor),
            Math.ceil(
              (Number(t.amount_minor) * amount) / Number(p.amount_minor),
            ),
          );
          if (!reverse) continue;
          const reversal = await provider!.transfers.createReversal(
            t.provider_id,
            { amount: reverse, metadata: { refundId } },
            { idempotencyKey: `reversal:${refundId}:${t.id}` },
          );
          await sql.transaction([
            sql`INSERT INTO transfer_reversals(id,transfer_id,refund_id,amount_minor,provider_id,status) VALUES(${randomUUID()},${t.id},${refundId},${reverse},${reversal.id},'paid') ON CONFLICT DO NOTHING`,
            sql`UPDATE guide_transfers SET reversed_minor=reversed_minor+${reverse} WHERE id=${t.id}`,
          ]);
        }
        const refund = await provider!.refunds.create(
          {
            payment_intent: p.payment_intent,
            amount,
            metadata: { refundId, requestId: id },
          },
          { idempotencyKey: `refund:${refundId}` },
        );
        await sql`UPDATE platform_refunds SET provider_id=${refund.id},status=CASE WHEN status='succeeded' THEN status ELSE 'pending' END WHERE id=${refundId}`;
        requested += amount;
        remaining -= amount;
      } catch {
        await sql`UPDATE platform_refunds SET status='needs-review' WHERE id=${refundId} AND status<>'succeeded'`;
        throw new HttpError(
          502,
          "The refund needs review. Do not retry blindly; check the payment ledger and Stripe.",
        );
      }
    }
    await sql.transaction([
      sql`SELECT platform_cancel_request(${id},${actor})`,
      sql`UPDATE hub_requests SET status='cancelled',cancelled_at=COALESCE(cancelled_at,now()),payment_status=CASE WHEN ${requested}>0 AND EXISTS(SELECT 1 FROM platform_refunds f WHERE f.request_id=${id} AND f.status IN ('requested','pending','needs-review')) THEN 'refund-pending' WHEN ${remaining}>0 AND ${cashPaid}>0 THEN 'cash-refund-review' WHEN ${requested}>0 AND paid_minor=0 THEN 'refunded' WHEN ${requested}>0 THEN 'partially-refunded' WHEN ${remaining}=0 AND paid_minor>0 THEN 'no-refund-due' ELSE payment_status END,updated_at=now() WHERE id=${id}`,
    ]);
    await audit(actor, "booking.cancel", id, {
      requestedRefundMinor: requested,
      reason,
    });
    await notifyBooking(
      id,
      `cancel:${id}`,
      "Booking cancellation update",
      `Your package was cancelled. Card refund requested: ${requested / 100} ${r.quote_currency}. Provider confirmation is pending; voucher/cash adjustments are handled by the team.`,
    );
    return {
      ok: true,
      refundMinor: requested,
      manualCashRefundMinor: Math.min(remaining, cashPaid),
      message:
        remaining > 0 && cashPaid > 0
          ? "Cancelled. Return the cash under the accepted policy, then record the actual cash refund in the ledger."
          : "Cancellation saved. Card refunds are confirmed by Stripe’s webhook.",
    };
  });
}
export async function reconcileRefund(refund: Stripe.Refund) {
  const sql = database();
  const row = (
    await sql`SELECT * FROM platform_refunds WHERE provider_id=${refund.id} OR id=${refund.metadata?.refundId || ""}`
  )[0];
  if (!row) return;
  const status =
    refund.status === "succeeded"
      ? "succeeded"
      : refund.status === "failed" || refund.status === "canceled"
        ? "failed"
        : "pending";
  await sql`SELECT platform_apply_refund(${row.id},${refund.id},${status},${refund.amount})`;
}
