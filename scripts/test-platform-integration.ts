import assert from "node:assert/strict";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import { database } from "../lib/db";
import { createPlan, editable } from "../lib/hub/store";
import { planSchema } from "../lib/hub/types";
import { guideSchema } from "../lib/platform/types";
import { handlePlatform } from "../lib/platform/api";
import {
  acceptCheckout,
  requireCheckout,
  pay,
  quoteTerms,
  paymentEnriched,
  cancelRefund,
  recordInvoice,
} from "../lib/platform/commerce";
import { approveFollowup, acceptFollowup } from "../lib/platform/extras";
import { commerceDefaults } from "../lib/platform/types";
import { documentPdf } from "../lib/platform/pdf";
import { releaseEarnings } from "../lib/platform/payouts";
import { upload, readAsset } from "../lib/platform/trips";
import { handle as legacyHandle } from "../lib/hub/api";
import { checkout } from "../lib/hub/bookings";
if (process.env.INTEGRATION_BRANCH !== "platform-v2-test-2026-11-19")
  throw new Error("Use the isolated platform test branch only.");
if (
  process.env.STRIPE_SECRET_KEY ||
  process.env.RESEND_API_KEY ||
  process.env.TELEGRAM_BOT_TOKEN
)
  throw new Error("Integration tests must not have live provider credentials.");
const sql = database(),
  prefix = "v2-" + randomUUID(),
  r1 = prefix + "-r1",
  r2 = prefix + "-r2",
  r3 = prefix + "-r3",
  g1 = prefix + "-g",
  followup = prefix + "-followup",
  guideUser = prefix + "-user",
  promo = "P-" + randomUUID().slice(0, 8).toUpperCase(),
  voucher = "V-" + randomUUID().slice(0, 8).toUpperCase();
const date = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  plan = planSchema.parse({
    title: "Platform integration trip",
    startDate: date,
    adults: 2,
    days: [
      {
        stops: [{ id: "s", itemId: "panfilov", start: "10:00", duration: 60 }],
      },
    ],
  });
const p = await createPlan(plan),
  privateRequest = (path: string, key = p.editToken, data?: unknown) =>
    new Request("https://example.test/api/platform/" + path, {
      method: data ? "POST" : "GET",
      headers: {
        "X-Plan-Key": key,
        Origin: "https://example.test",
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
let count = 0;
const check = (name: string) => console.log(`PASS ${++count}: ${name}`);
try {
  for (const id of [r1, r2, r3]) {
    await sql`INSERT INTO hub_requests(id,plan_id,guest,idempotency_key) VALUES(${id},${p.id},${JSON.stringify({ name: "Test Traveller", email: "test@example.test", language: "en", allergies: "", accessibility: "", phone: "", messageConsent: false, marketingConsent: false })}::jsonb,${id})`;
    const q = id + "-q";
    await sql`INSERT INTO hub_quotes(id,request_id,plan_version,plan,breakdown,amount_minor,currency,deposit_percent,terms,status) VALUES(${q},${id},1,${JSON.stringify(plan)}::jsonb,'{}',10000,'KZT',30,'Integration terms','approved')`;
    await sql`UPDATE hub_requests SET quote_id=${q} WHERE id=${id}`;
    await sql`INSERT INTO platform_quote_terms(quote_id,data) VALUES(${q},${JSON.stringify(quoteTerms(10000, commerceDefaults, "KZT"))}::jsonb)`;
  }
  await assert.rejects(
    handlePlatform(privateRequest(`booking/${r1}`, "invalid"), ["booking", r1]),
    /private edit/,
  );
  const publicData = await (
    await handlePlatform(privateRequest(`booking/${r1}`), ["booking", r1])
  ).json();
  assert.equal(publicData.totalMinor, 10000);
  check("booking data requires the matching private capability");
  for (const resource of ["research", "guides", "commerce"]) {
    const result = await handlePlatform(
      new Request("https://example.test/api/platform/admin/" + resource),
      ["admin", resource],
    ).catch((e) => e);
    assert.equal(result.status, 401);
  }
  check("owner and guide administration reject anonymous access");
  const guide = guideSchema.parse({
    id: g1,
    name: "Integration Guide",
    email: "guide@example.test",
    languages: ["en"],
    specialties: ["history"],
    rateType: "tour",
    rateMinor: 1000,
    status: "active",
  });
  await sql`INSERT INTO guides(id,user_id,data,status,terms_accepted) VALUES(${g1},${guideUser},${JSON.stringify(guide)}::jsonb,'active','test-terms')`;
  await sql`INSERT INTO guide_availability(id,guide_id,starts_at,ends_at) VALUES(${prefix + "-calendar"},${g1},now(),now()+interval '30 days')`;
  const start = new Date(date + "T10:00:00+05:00").toISOString(),
    end = new Date(date + "T11:00:00+05:00").toISOString();
  const outcomes = await Promise.allSettled(
    [r1, r2].map(
      (id) =>
        sql`SELECT platform_offer_guide(${id + "-assignment"},${id},${g1},${start},${end},1000,now()+interval '30 minutes')`,
    ),
  );
  assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
  const winner = outcomes[0].status === "fulfilled" ? r1 : r2,
    assignment = winner + "-assignment";
  await sql`SELECT platform_guide_action(${assignment},${g1},'accept')`;
  await assert.rejects(
    sql`SELECT platform_calendar(${prefix + "-blocked"},${g1},${start},${end},true)`,
  );
  await assert.rejects(
    sql`SELECT platform_guide_action(${assignment},${g1},'complete')`,
  );
  check(
    "concurrent offers cannot double-book a guide; accepted trips block calendar conflicts and early completion",
  );
  await sql`SELECT platform_reassign_guide(${assignment})`;
  await assert.rejects(
    sql`SELECT platform_guide_action(${assignment},${g1},'start')`,
  );
  assert.equal(
    (await sql`SELECT status FROM guide_assignments WHERE id=${assignment}`)[0]
      .status,
    "reassigned",
  );
  check(
    "reassignment revokes the prior guide assignment before a replacement offer",
  );
  const changedAssignment = winner + "-changed";
  await sql`SELECT platform_offer_guide(${changedAssignment},${winner},${g1},${start},${end},1000,now()+interval '30 minutes')`;
  await sql`SELECT platform_guide_action(${changedAssignment},${g1},'accept')`;
  await assert.rejects(sql`SELECT platform_complete_request(${winner})`);
  await sql`SELECT platform_schedule_change(${winner},${new Date(new Date(start).valueOf() + 86400000).toISOString()},${new Date(new Date(end).valueOf() + 86400000).toISOString()},'KZT')`;
  assert.equal(
    (
      await sql`SELECT status FROM guide_assignments WHERE id=${changedAssignment}`
    )[0].status,
    "schedule-changed",
  );
  check(
    "a changed quote schedule retires the old guide reservation and active guides prevent premature CRM completion",
  );
  const now = new Date().toISOString(),
    expires = new Date(Date.now() + 86400000).toISOString();
  for (const c of [
    { code: promo, kind: "promo", percent: 10, amountMinor: 0, maxUses: 20 },
    {
      code: voucher,
      kind: "voucher",
      percent: 0,
      amountMinor: 10000,
      maxUses: 20,
    },
  ])
    await sql`INSERT INTO platform_codes(code,data,balance_minor) VALUES(${c.code},${JSON.stringify({ ...c, currency: "KZT", customerId: "", minimumMinor: 0, startsAt: now, expiresAt: expires, active: true })}::jsonb,${c.amountMinor})`;
  for (const id of [r1, r2])
    await sql`INSERT INTO platform_checkout(request_id,promo_code,voucher_code,terms_version,terms_accepted_at) VALUES(${id},${promo},${voucher},${quoteTerms(10000, commerceDefaults, "KZT").version},now())`;
  const locks = await Promise.all(
    [r1, r2].map(
      (id) =>
        sql`SELECT platform_lock_discounts(${id},10000,'KZT','') AS value`,
    ),
  );
  assert.equal(locks[0][0].value.discountMinor, 1000);
  assert.equal(locks[1][0].value.discountMinor, 1000);
  const reserved = (
    await sql`SELECT sum(value_minor)::int AS total FROM platform_redemptions WHERE code=${voucher} AND status='held'`
  )[0].total;
  assert.equal(reserved, 10000);
  check(
    "promo is applied before voucher and concurrent holds never overdraw shared credit",
  );
  const first = r1;
  await sql`UPDATE platform_redemptions SET expires_at=now()-interval '1 minute' WHERE request_id=${first} AND code=${voucher}`;
  const before = (
    await sql`SELECT uses FROM platform_codes WHERE code=${promo}`
  )[0].uses;
  assert.equal(
    (await sql`SELECT platform_apply_discounts(${first}) AS ok`)[0].ok,
    false,
  );
  assert.equal(
    (await sql`SELECT uses FROM platform_codes WHERE code=${promo}`)[0].uses,
    before,
  );
  await assert.rejects(requireCheckout(first), /expired/);
  check(
    "an expired voucher prevents all redemption; promo uses are not partially consumed",
  );
  await sql`UPDATE platform_redemptions SET status='released' WHERE request_id IN (${r1},${r2})`;
  for (const id of [r1, r2])
    await sql`UPDATE platform_checkout SET promo_code=NULL,voucher_code=NULL,discount_minor=0,voucher_minor=0 WHERE request_id=${id}`;
  const acceptance = await acceptCheckout(
    r3,
    "",
    quoteTerms(10000, commerceDefaults, "KZT").version,
    promo,
    "",
  );
  assert.equal(acceptance.totalMinor, 9000);
  const created: any[] = [];
  const mock = {
    checkout: {
      sessions: {
        create: async (data: any, options: any) => {
          created.push({ data, options });
          return {
            id:
              prefix + (created.length === 1 ? "-session" : "-balance-session"),
            url: "https://checkout.stripe.test/session",
          };
        },
        retrieve: async () => ({
          status: "open",
          url: "https://checkout.stripe.test/session",
        }),
        expire: async () => ({}),
      },
    },
  };
  process.env.STRIPE_INVOICE_ENABLED = "true";
  const result = await checkout(r3, "deposit", mock as any);
  delete process.env.STRIPE_INVOICE_ENABLED;
  assert.equal(result.url, "https://checkout.stripe.test/session");
  assert.equal(created[0].data.line_items[0].price_data.unit_amount, 2700);
  assert.equal(created[0].data.invoice_creation.enabled, true);
  await checkout(r3, "deposit", mock as any);
  assert.equal(created.length, 1);
  check(
    "hosted checkout charges the server-side discounted deposit and reuses the open session",
  );
  const invoice = {
    id: prefix + "-invoice",
    status: "paid",
    total: 2700,
    amount_paid: 2700,
    currency: "kzt",
    metadata: created[0].data.invoice_creation.invoice_data.metadata,
    invoice_pdf: "https://pay.stripe.com/invoice/test/pdf",
    hosted_invoice_url: "https://invoice.stripe.com/test",
    number: "TEST-001",
  };
  await assert.rejects(
    recordInvoice({ ...invoice, total: 9999 } as any),
    /does not match/,
  );
  await recordInvoice(invoice as any);
  await recordInvoice(invoice as any);
  assert.equal(
    Number(
      (await sql`SELECT paid_minor FROM hub_requests WHERE id=${r3}`)[0]
        .paid_minor,
    ),
    0,
  );
  assert.equal(
    (
      await sql`SELECT invoice_number FROM hub_payment_sessions WHERE request_id=${r3}`
    )[0].invoice_number,
    "TEST-001",
  );
  check(
    "paid invoice documents match the exact server amount and cannot credit money or confirm a booking",
  );
  await sql`SELECT hub_apply_payment(${prefix + "-event"},${prefix + "-session"},2700,'kzt')`;
  const service = {
    paymentIntents: {
      retrieve: async () => ({
        id: prefix + "-intent",
        latest_charge: {
          id: prefix + "-charge",
          receipt_url: "https://receipt.stripe.test/receipt",
        },
      }),
    },
  };
  const session = {
    id: prefix + "-session",
    payment_intent: prefix + "-intent",
  };
  await paymentEnriched(session as any, service as any);
  await paymentEnriched(session as any, service as any);
  assert.equal(
    (await sql`SELECT payment_status FROM hub_requests WHERE id=${r3}`)[0]
      .payment_status,
    "deposit-paid",
  );
  assert.equal(
    (
      await sql`SELECT count(*)::int AS total FROM platform_documents WHERE request_id=${r3}`
    )[0].total,
    1,
  );
  check(
    "payment enrichment is idempotent, creates one acknowledgment and marks a partial deposit accurately",
  );
  await sql`UPDATE hub_requests SET status='quote-sent' WHERE id=${r3}`;
  await pay(r3, "deposit");
  assert.equal(
    (await sql`SELECT payment_status FROM hub_requests WHERE id=${r3}`)[0]
      .payment_status,
    "deposit-paid",
  );
  assert.equal(
    Number(
      (await sql`SELECT paid_minor FROM hub_requests WHERE id=${r3}`)[0]
        .paid_minor,
    ),
    2700,
  );
  check(
    "an accepted updated package can reconfirm using its existing deposit without charging it twice",
  );
  await sql`UPDATE hub_requests SET status='completed' WHERE id=${r3}`;
  await sql`UPDATE hub_quotes SET expires_at=now()-interval '1 day' WHERE request_id=${r3}`;
  await checkout(r3, "full", mock as any);
  assert.equal(created[1].data.line_items[0].price_data.unit_amount, 6300);
  const balanceStatus = (
    await sql`SELECT hub_apply_payment(${prefix + "-balance-event"},${prefix + "-balance-session"},6300,'kzt') AS status`
  )[0].status;
  assert.equal(balanceStatus, "completed");
  await paymentEnriched(
    {
      id: prefix + "-balance-session",
      payment_intent: prefix + "-intent",
    } as any,
    service as any,
  );
  assert.equal(
    (await sql`SELECT status FROM hub_requests WHERE id=${r3}`)[0].status,
    "completed",
  );
  check(
    "an established completed package can settle its balance without reserving past inventory or resetting completion",
  );
  const refund = prefix + "-refund";
  await sql`INSERT INTO platform_refunds(id,request_id,payment_id,amount_minor,reason,actor) VALUES(${refund},${r3},${prefix + "-session"},700,'Test','test')`;
  await sql`SELECT platform_apply_refund(${refund},'re_test','succeeded',700)`;
  await sql`SELECT platform_apply_refund(${refund},'re_test','succeeded',700)`;
  assert.equal(
    Number(
      (await sql`SELECT paid_minor FROM hub_requests WHERE id=${r3}`)[0]
        .paid_minor,
    ),
    8300,
  );
  await paymentEnriched(session as any, service as any);
  assert.equal(
    (await sql`SELECT payment_status FROM hub_requests WHERE id=${r3}`)[0]
      .payment_status,
    "partially-refunded",
  );
  await assert.rejects(
    sql`SELECT platform_apply_refund(${refund},'re_other','succeeded',800)`,
  );
  check(
    "duplicate refund events subtract funds once and mismatched amounts are rejected",
  );
  await sql`UPDATE hub_requests SET status='new',payment_status='unpaid' WHERE id=${r1}`;
  const arrival = await pay(r1, "arrival");
  assert.ok(arrival.url?.includes("/payment/"));
  assert.equal(
    (await sql`SELECT payment_status FROM hub_requests WHERE id=${r1}`)[0]
      .payment_status,
    "pay-on-arrival",
  );
  check("pay-on-arrival confirms capacity without claiming that cash was paid");

  const photoForm = new FormData();
  photoForm.set(
    "photo",
    new File(
      [
        await sharp({
          create: { width: 8, height: 8, channels: 3, background: "#ff6b35" },
        })
          .png()
          .toBuffer(),
      ],
      "test.png",
      { type: "image/png" },
    ),
  );
  const photo = await upload(
    new Request("https://example.test/upload", {
      method: "POST",
      headers: { "X-Plan-Key": p.editToken },
      body: photoForm,
    }),
    r3,
  );
  await assert.rejects(
    readAsset(privateRequest("trip/" + r3, "invalid"), r3, photo.id),
    /private edit/,
  );
  const photoResponse = await readAsset(
    privateRequest("trip/" + r3),
    r3,
    photo.id,
  );
  assert.equal(photoResponse.headers.get("Content-Type"), "image/jpeg");
  const photoBytes = Buffer.from(await photoResponse.arrayBuffer());
  assert.equal(photoBytes.subarray(0, 2).toString("hex"), "ffd8");
  check(
    "private photos are decoded/re-encoded as JPEG and require booking access on every read",
  );
  const payoutAssignment = r2 + "-payout";
  await sql`UPDATE guide_assignments SET status='cancelled' WHERE request_id=${r2}`;
  await sql`INSERT INTO guide_assignments(id,request_id,guide_id,status,starts_at,ends_at,expires_at,fee_minor,commission_percent,currency,completion_approved) VALUES(${payoutAssignment},${r2},${g1},'completed',now()-interval '4 days',now()-interval '3 days',now(),1000,20,'KZT',true)`;
  await sql`UPDATE guides SET data=jsonb_set(data,'{country}','"US"'::jsonb),stripe_account='acct_test_only' WHERE id=${g1}`;
  await sql`UPDATE hub_requests SET status='completed',paid_minor=10000,payment_status='paid' WHERE id=${r2}`;
  await sql`INSERT INTO hub_payment_sessions(id,request_id,quote_id,amount_minor,currency,status,payment_intent,charge_id) VALUES(${prefix + "-paid-session"},${r2},${r2 + "-q"},10000,'KZT','paid','pi_test','ch_test')`;
  let transferCalls = 0,
    reversalCalls = 0,
    refundCalls = 0;
  const payoutMock = {
    v2: {
      core: {
        accounts: {
          retrieve: async () => ({
            configuration: {
              recipient: {
                capabilities: {
                  stripe_balance: { stripe_transfers: { status: "active" } },
                },
              },
            },
          }),
        },
      },
    },
    transfers: {
      create: async () => {
        transferCalls++;
        return { id: "tr_test" };
      },
      createReversal: async () => {
        reversalCalls++;
        return { id: "trr_test" };
      },
    },
    refunds: {
      create: async (input: any) => {
        refundCalls++;
        await sql`SELECT platform_apply_refund(${input.metadata.refundId},'re_test_cancel','succeeded',${input.amount})`;
        return { id: "re_test_cancel", status: "succeeded" };
      },
    },
  };
  await assert.rejects(
    releaseEarnings(payoutAssignment, "test", payoutMock as any),
    /eligibility/,
  );
  process.env.STRIPE_CONNECT_ENABLED = "true";
  process.env.STRIPE_PLATFORM_COUNTRY = "US";
  process.env.STRIPE_CONNECT_COUNTRIES = "US";
  await Promise.allSettled(
    [1, 2].map(() =>
      releaseEarnings(payoutAssignment, "test", payoutMock as any),
    ),
  );
  await releaseEarnings(payoutAssignment, "test", payoutMock as any);
  assert.equal(transferCalls, 1);
  assert.equal(
    Number(
      (
        await sql`SELECT amount_minor FROM guide_transfers WHERE assignment_id=${payoutAssignment}`
      )[0].amount_minor,
    ),
    800,
  );
  check(
    "eligible completed guide earnings allocate the commission once using provider-idempotent ledger IDs",
  );
  const cancellation = await cancelRefund(
    r2,
    "test",
    "Sandbox policy refund",
    payoutMock as any,
  );
  assert.equal(cancellation.refundMinor, 10000);
  assert.equal(reversalCalls, 1);
  assert.equal(refundCalls, 1);
  assert.equal(
    (await sql`SELECT payment_status FROM hub_requests WHERE id=${r2}`)[0]
      .payment_status,
    "refunded",
  );
  assert.equal(
    Number(
      (await sql`SELECT paid_minor FROM hub_requests WHERE id=${r2}`)[0]
        .paid_minor,
    ),
    0,
  );
  await assert.rejects(
    cancelRefund(r2, "test", "Repeat", payoutMock as any),
    /already cancelled|pending/,
  );
  assert.equal(refundCalls, 1);
  check(
    "policy cancellation reverses guide allocation before the refund and blocks a duplicate cancellation even when the refund webhook arrives early",
  );
  delete process.env.STRIPE_CONNECT_ENABLED;
  delete process.env.STRIPE_PLATFORM_COUNTRY;
  delete process.env.STRIPE_CONNECT_COUNTRIES;
  const cashId = randomUUID(),
    cashRefundId = randomUUID();
  await sql`SELECT platform_record_cash(${cashId},${r1},10000,'test')`;
  await sql`SELECT platform_record_cash(${cashId},${r1},10000,'test')`;
  assert.equal(
    Number(
      (await sql`SELECT paid_minor FROM hub_requests WHERE id=${r1}`)[0]
        .paid_minor,
    ),
    10000,
  );
  const cashCancellation = await cancelRefund(
    r1,
    "test",
    "Actual cash refund to arrange",
  );
  assert.equal(cashCancellation.manualCashRefundMinor, 10000);
  await sql`SELECT platform_record_cash_refund(${cashRefundId},${r1},10000,'test')`;
  await sql`SELECT platform_record_cash_refund(${cashRefundId},${r1},10000,'test')`;
  assert.equal(
    Number(
      (await sql`SELECT paid_minor FROM hub_requests WHERE id=${r1}`)[0]
        .paid_minor,
    ),
    0,
  );
  check(
    "cash receipts and actual cash refunds are idempotent and never invoke Stripe",
  );
  await sql`INSERT INTO hub_payment_sessions(id,request_id,quote_id,amount_minor,currency) VALUES(${prefix + "-late-session"},${r1},${r1 + "-q"},10000,'KZT')`;
  await sql`SELECT hub_apply_payment(${prefix + "-late-event"},${prefix + "-late-session"},10000,'kzt')`;
  await sql`UPDATE platform_checkout SET promo_code='EXPIRED-CODE' WHERE request_id=${r1}`;
  await paymentEnriched(
    { id: prefix + "-late-session", payment_intent: prefix + "-intent" } as any,
    service as any,
  );
  assert.equal(
    (await sql`SELECT status FROM hub_requests WHERE id=${r1}`)[0].status,
    "cancelled",
  );
  assert.equal(
    (await sql`SELECT payment_status FROM hub_requests WHERE id=${r1}`)[0]
      .payment_status,
    "refund-review",
  );
  check(
    "a late payment cannot reopen a cancellation or consume its expired credit",
  );
  const legacyAssignment = r1 + "-legacy";
  await sql`UPDATE hub_requests SET status='confirmed',payment_status='paid',cancelled_at=NULL WHERE id=${r1}`;
  await sql`INSERT INTO guide_assignments(id,request_id,guide_id,status,starts_at,ends_at,expires_at,fee_minor,commission_percent,currency) VALUES(${legacyAssignment},${r1},${g1},'accepted',${start},${end},now()+interval '30 minutes',1000,20,'KZT')`;
  const pastDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  await sql`UPDATE hub_quotes SET plan=jsonb_set(plan,'{startDate}',${JSON.stringify(pastDate)}::jsonb) WHERE id=${r1 + "-q"}`;
  await sql`UPDATE hub_plans SET data=jsonb_set(data,'{startDate}','"2027-12-20"'::jsonb),version=version+1 WHERE id=${p.id}`;
  await legacyHandle(
    privateRequest("requests/" + r1, p.editToken, { action: "cancel" }),
    ["requests", r1],
  );
  assert.equal(
    (
      await sql`SELECT status FROM guide_assignments WHERE id=${legacyAssignment}`
    )[0].status,
    "cancelled",
  );
  assert.ok(
    (await sql`SELECT cancelled_at FROM hub_requests WHERE id=${r1}`)[0]
      .cancelled_at,
  );
  const policyCancellation = await cancelRefund(
    r1,
    "test",
    "Apply accepted quote policy",
  );
  assert.equal(policyCancellation.refundMinor, 0);
  assert.equal(
    (await sql`SELECT payment_status FROM hub_requests WHERE id=${r1}`)[0]
      .payment_status,
    "no-refund-due",
  );
  await legacyHandle(
    privateRequest("requests/" + r1, p.editToken, { action: "cancel" }),
    ["requests", r1],
  );
  assert.equal(
    (await sql`SELECT payment_status FROM hub_requests WHERE id=${r1}`)[0]
      .payment_status,
    "no-refund-due",
  );
  check(
    "legacy client cancellation releases the guide, uses accepted dates rather than editable dates, and cannot restart a resolved refund",
  );
  await assert.rejects(
    handlePlatform(
      privateRequest(`trip/${r3}`, p.editToken, { action: "followup", plan }),
      ["trip", r3],
    ),
    /Only the assigned guide/,
  );
  const followupPlan = planSchema.parse({
    ...plan,
    startDate: new Date(new Date(date + "T12:00:00Z").valueOf() + 86400000)
      .toISOString()
      .slice(0, 10),
  });
  await sql`INSERT INTO guide_followups(id,request_id,guide_id,data) VALUES(${followup},${r3},${g1},${JSON.stringify({ plan: followupPlan })}::jsonb)`;
  await approveFollowup(
    followup,
    {
      plan: followupPlan,
      amountMinor: 12000,
      currency: "KZT",
      depositPercent: 30,
      terms: "Test final follow-up quote, including cancellation terms.",
    },
    "test-manager",
  );
  const version = (
    await sql`SELECT data FROM guide_followups WHERE id=${followup}`
  )[0].data.offerVersion;
  await assert.rejects(
    acceptFollowup(
      privateRequest(`trip/${r3}`),
      r3,
      followup,
      "old-version",
      true,
      "full",
    ),
    /offer changed/,
  );
  const accepted = await Promise.all(
    [1, 2].map(() =>
      acceptFollowup(
        privateRequest(`trip/${r3}`),
        r3,
        followup,
        version,
        true,
        "full",
      ),
    ),
  );
  const childId = new URL(accepted[0].url!).pathname.split("/").at(-1)!;
  assert.equal(new URL(accepted[1].url!).pathname.split("/").at(-1), childId);
  assert.equal(
    (
      await sql`SELECT count(*)::int AS n FROM hub_requests WHERE idempotency_key=${"followup:" + followup}`
    )[0].n,
    1,
  );
  assert.equal(
    (
      await sql`SELECT count(*)::int AS n FROM guide_assignments WHERE request_id=${childId}`
    )[0].n,
    1,
  );
  for (const result of accepted) {
    const booking = await (
      await handlePlatform(
        privateRequest(`booking/${childId}`, result.editToken!),
        ["booking", childId],
      )
    ).json();
    assert.equal(booking.totalMinor, 12000);
  }
  await pay(childId, "arrival");
  assert.equal(
    (await sql`SELECT status FROM hub_requests WHERE id=${childId}`)[0].status,
    "confirmed",
  );
  assert.equal(
    Number(
      (await sql`SELECT paid_minor FROM hub_requests WHERE id=${childId}`)[0]
        .paid_minor,
    ),
    0,
  );
  check(
    "manager-approved follow-up accepts one immutable offer under concurrent clicks, reserves one guide, and opens private checkout without faking payment",
  );
  const bytes = await documentPdf(
    "Offline trip QA",
    ["English and Русский: Алматы", "Private trip example. Emergency: 112."],
    { plan, items: [] },
  );
  assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), "%PDF");
  await mkdir("../../work/platform-qa", { recursive: true });
  await writeFile("../../work/platform-qa/offline-test.pdf", bytes);
  check(
    "offline document embeds Cyrillic-capable fonts and produces a valid PDF",
  );
  console.log(
    `Platform integration: ${count} checks passed. No real messages or payments were sent.`,
  );
} finally {
  const child = (
    await sql`SELECT r.id,r.plan_id FROM hub_requests r JOIN guide_followups f ON f.new_request_id=r.id WHERE f.id=${followup}`
  )[0];
  if (child) {
    await sql`UPDATE guide_followups SET new_request_id=NULL WHERE id=${followup}`;
    await sql`DELETE FROM guide_assignments WHERE request_id=${child.id}`;
    await sql`DELETE FROM platform_checkout WHERE request_id=${child.id}`;
    await sql`DELETE FROM hub_holds WHERE request_id=${child.id}`;
    await sql`DELETE FROM platform_quote_terms WHERE quote_id IN (SELECT id FROM hub_quotes WHERE request_id=${child.id})`;
    await sql`UPDATE hub_requests SET quote_id=NULL WHERE id=${child.id}`;
    await sql`DELETE FROM hub_quotes WHERE request_id=${child.id}`;
    await sql`DELETE FROM hub_messages WHERE request_id=${child.id}`;
    await sql`DELETE FROM hub_requests WHERE id=${child.id}`;
    await sql`DELETE FROM hub_access_links WHERE plan_id=${child.plan_id}`;
    await sql`DELETE FROM hub_plans WHERE id=${child.plan_id}`;
  }
  await sql`DELETE FROM transfer_reversals WHERE refund_id IN (SELECT id FROM platform_refunds WHERE request_id IN (${r1},${r2},${r3}))`;
  for (const table of [
    "guide_transfers",
    "platform_refunds",
    "platform_documents",
    "platform_redemptions",
    "platform_checkout",
    "platform_cash_refunds",
    "platform_cash",
    "guide_reviews",
    "guide_followups",
    "private_assets",
    "safety_events",
  ]) {
    if (table === "guide_reviews")
      await sql.query(
        "DELETE FROM guide_reviews WHERE assignment_id IN (SELECT id FROM guide_assignments WHERE request_id = ANY($1))",
        [[r1, r2, r3]],
      );
    else if (table === "guide_transfers")
      await sql.query(
        "DELETE FROM guide_transfers WHERE assignment_id IN (SELECT id FROM guide_assignments WHERE request_id = ANY($1))",
        [[r1, r2, r3]],
      );
    else
      await sql.query(`DELETE FROM ${table} WHERE request_id = ANY($1)`, [
        [r1, r2, r3],
      ]);
  }
  await sql`DELETE FROM guide_assignments WHERE request_id IN (${r1},${r2},${r3})`;
  await sql`DELETE FROM guide_availability WHERE guide_id=${g1}`;
  await sql`DELETE FROM guides WHERE id=${g1}`;
  await sql`DELETE FROM platform_codes WHERE code IN (${promo},${voucher})`;
  await sql`DELETE FROM hub_payment_sessions WHERE request_id IN (${r1},${r2},${r3})`;
  await sql`DELETE FROM platform_quote_terms WHERE quote_id IN (SELECT id FROM hub_quotes WHERE request_id IN (${r1},${r2},${r3}))`;
  await sql`UPDATE hub_requests SET quote_id=NULL WHERE id IN (${r1},${r2},${r3})`;
  await sql`DELETE FROM hub_quotes WHERE request_id IN (${r1},${r2},${r3})`;
  await sql`DELETE FROM hub_holds WHERE request_id IN (${r1},${r2},${r3})`;
  await sql`DELETE FROM hub_messages WHERE request_id IN (${r1},${r2},${r3})`;
  await sql`DELETE FROM hub_requests WHERE id IN (${r1},${r2},${r3})`;
  await sql`DELETE FROM hub_access_links WHERE plan_id=${p.id}`;
  await sql`DELETE FROM hub_plans WHERE id=${p.id}`;
  await sql`DELETE FROM hub_notifications WHERE id LIKE ${"%" + prefix + "%"}`;
  await sql`DELETE FROM hub_payment_events WHERE id LIKE ${prefix + "%"}`;
  console.log("Isolated platform test records removed.");
}
