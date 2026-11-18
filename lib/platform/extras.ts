import { randomUUID } from "node:crypto";
import { database } from "@/lib/db";
import { clientSession } from "@/lib/hub/access";
import {
  notify,
  audit,
  catalog,
  privateLink,
  assignedManager,
} from "@/lib/hub/store";
import { z } from "zod";
import { planSlots } from "@/lib/hub/bookings";
import { quoteTerms, pay } from "./commerce";
import { tripWindow } from "./guides";
import { notifyBooking } from "./store";
import { guideSchema } from "./types";
import { hash, token, HttpError } from "@/lib/hub/security";
import { planSchema } from "@/lib/hub/types";
import { commerceSettings, booking } from "./store";
import { unsubscribeToken, validUnsubscribe } from "@/lib/hub/newsletter";
import { siteUrl } from "@/lib/site";
export async function waitlistJoin(
  email: string,
  itemId: string,
  guests: number,
  consent: boolean,
) {
  if (!consent)
    throw new HttpError(
      400,
      "Agree to receive availability and deal notices for this service.",
    );
  const item = (await catalog()).find((i) => i.id === itemId && i.bookable);
  if (!item) throw new HttpError(400, "Choose a published bookable service.");
  const sql = database(),
    key = token(),
    id = randomUUID();
  await sql`INSERT INTO waitlist(id,email,item_id,guests,token_hash) VALUES(${id},${email},${itemId},${guests},${hash(key)})`;
  await notify(
    `waitlist-confirm:${id}`,
    email,
    "Confirm Almaty availability alerts",
    `Confirm this service alert: ${siteUrl}/deals#confirm=${id}:${key}\nYou can unsubscribe from any alert using the same private link.`,
  );
  return { ok: true, delivery: "queued" };
}
export async function waitlistConfirm(id: string, key: string, active = true) {
  const rows =
    await database()`UPDATE waitlist SET confirmed=CASE WHEN ${active} THEN true ELSE confirmed END,active=${active} WHERE id=${id} AND (token_hash=${hash(key)} OR (${!active} AND ${validUnsubscribe("waitlist:" + id, key)})) RETURNING id`;
  if (!rows.length)
    throw new HttpError(400, "Invalid private subscription link.");
  return { ok: true };
}
export async function loyalty() {
  const user = await clientSession();
  if (!user)
    throw new HttpError(
      401,
      "Sign in with a verified email to see loyalty rewards.",
    );
  const sql = database(),
    code =
      "ALM-" +
      token()
        .slice(0, 10)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "X");
  await sql`INSERT INTO loyalty_accounts(user_id,referral_code) VALUES(${user.id},${code}) ON CONFLICT DO NOTHING`;
  return {
    account: (
      await sql`SELECT referral_code,points FROM loyalty_accounts WHERE user_id=${user.id}`
    )[0],
    codes:
      await sql`SELECT code,data,balance_minor,uses FROM platform_codes WHERE data->>'customerId'=${user.id} AND (data->>'expiresAt')::timestamptz>now()`,
    referrals:
      await sql`SELECT status,created_at FROM referral_rewards WHERE referrer_id=${user.id} ORDER BY created_at DESC LIMIT 50`,
  };
}
export async function referral(request: Request, id: string, code: string) {
  const a = await booking(request, id, { staff: false, guide: false });
  if (!a.user)
    throw new HttpError(
      401,
      "Link the plan to your verified account before claiming a referral.",
    );
  const sql = database(),
    ref = (
      await sql`SELECT user_id FROM loyalty_accounts WHERE referral_code=${code}`
    )[0];
  if (!ref || ref.user_id === a.user.id)
    throw new HttpError(400, "Choose another traveller’s valid referral code.");
  if (
    (
      await sql`SELECT id FROM hub_requests r JOIN hub_plans p ON p.id=r.plan_id WHERE p.client_id=${a.user.id} AND r.id<>${id} AND r.paid_minor>0`
    )[0]
  )
    throw new HttpError(
      409,
      "Referral rewards are for a new customer’s first paid trip.",
    );
  if (Number(a.request.paid_minor) > 0)
    throw new HttpError(409, "Apply a referral before paying.");
  await sql`INSERT INTO referral_rewards(request_id,referrer_id) VALUES(${id},${ref.user_id}) ON CONFLICT DO NOTHING`;
  return { ok: true };
}
export async function createFollowup(
  request: Request,
  id: string,
  input: unknown,
) {
  const a = await booking(request, id);
  if (a.role !== "guide" || !a.assignment || a.request.status !== "completed")
    throw new HttpError(
      403,
      "Only the assigned guide can propose a post-trip follow-up.",
    );
  const plan = planSchema.parse(input);
  const fid = randomUUID();
  await database()`INSERT INTO guide_followups(id,request_id,guide_id,data) VALUES(${fid},${id},${a.assignment.guide_id},${JSON.stringify({ plan })}::jsonb)`;
  await audit(a.actor, "guide.followup.propose", id, { followup: fid });
  return { ok: true };
}
export async function approveFollowup(
  id: string,
  input: unknown,
  actor: string,
) {
  const sql = database(),
    f = (
      await sql`SELECT * FROM guide_followups WHERE id=${id} AND status IN ('pending','approved')`
    )[0];
  if (!f) throw new HttpError(409, "Proposal is no longer editable.");
  const data = z
    .object({
      plan: planSchema,
      amountMinor: z.number().int().min(0).max(100000000),
      currency: z.enum(["KZT", "USD", "EUR", "RUB", "GBP"]),
      depositPercent: z.number().int().min(1).max(100),
      terms: z.string().trim().min(10).max(5000),
    })
    .parse(input);
  const guide = guideSchema.parse(
    (
      await sql`SELECT data FROM guides WHERE id=${f.guide_id} AND status='active'`
    )[0]?.data,
  );
  if (guide.currency !== data.currency)
    throw new HttpError(
      400,
      "The follow-up settlement currency must match the guide allocation currency.",
    );
  const plan = { ...data.plan, preferredGuideId: f.guide_id },
    items = await catalog();
  await planSlots(plan, items, true);
  const w = tripWindow(plan);
  if (new Date(w.start).valueOf() < Date.now())
    throw new HttpError(400, "Choose future dates and current service slots.");
  const minimum = Math.max(
    1,
    ...plan.days.flatMap((day) =>
      day.stops.map(
        (stop) =>
          items.find((i) => i.id === stop.itemId)?.serviceDepositPercent || 1,
      ),
    ),
  );
  if (data.depositPercent < minimum)
    throw new HttpError(
      400,
      `A service requires at least ${minimum}% deposit.`,
    );
  const fee = Math.ceil(
    guide.rateMinor * (guide.rateType === "hour" ? w.hours : 1),
  );
  const offerVersion = randomUUID(),
    quote = {
      amountMinor: data.amountMinor,
      currency: data.currency,
      depositPercent: data.depositPercent,
      terms: data.terms,
    },
    policy = quoteTerms(
      data.amountMinor,
      await commerceSettings(),
      data.currency,
    );
  const record = {
    plan,
    quote,
    policy,
    offerVersion,
    guideFeeMinor: fee,
    approvedBy: actor,
    approvedAt: new Date().toISOString(),
  };
  const updated =
    await sql`UPDATE guide_followups SET data=${JSON.stringify(record)}::jsonb,status='approved' WHERE id=${id} AND status IN ('pending','approved') RETURNING id`;
  if (!updated.length)
    throw new HttpError(409, "The traveller already accepted this offer.");
  await audit(actor, "followup.quote.approve", f.request_id, {
    followup: id,
    offerVersion,
  });
  const parent = (
    await sql`SELECT guest FROM hub_requests WHERE id=${f.request_id}`
  )[0];
  await notifyBooking(
    f.request_id,
    `followup-ready:${offerVersion}`,
    "A new Almaty trip offer is ready",
    "Your travel desk reviewed a follow-up proposal. Open your private trip area to review the full itinerary, price and terms.",
    parent?.guest.marketingConsent === true,
  );
  return { ok: true };
}
export async function acceptFollowup(
  request: Request,
  id: string,
  followupId: string,
  version: string,
  acceptTerms: boolean,
  mode: "full" | "deposit" | "arrival",
  payNow = false,
) {
  if (!acceptTerms)
    throw new HttpError(
      400,
      "Review and accept this offer and its cancellation terms first.",
    );
  const a = await booking(request, id, { staff: false, guide: false }),
    sql = database(),
    f = (
      await sql`SELECT * FROM guide_followups WHERE id=${followupId} AND request_id=${id} AND status IN ('approved','accepted')`
    )[0];
  if (!f || f.data.offerVersion !== version)
    throw new HttpError(409, "The offer changed. Reload and review it again.");
  let requestId: string = f.new_request_id || "";
  if (!requestId) {
    const plan = planSchema.parse(f.data.plan),
      items = await catalog(),
      slots = await planSlots(plan, items, true),
      w = tripWindow(plan),
      manager = await assignedManager(a.request.guest.language);
    try {
      requestId = (
        await sql`SELECT platform_accept_followup(${f.id},${version},${token().slice(0, 24)},${hash(token())},${randomUUID()},${randomUUID()},${a.user?.id || null},${manager?.user_id || null},${JSON.stringify(slots)}::jsonb,${randomUUID()},${w.start},${w.end},${f.data.guideFeeMinor}) AS id`
      )[0].id;
    } catch {
      throw new HttpError(
        409,
        "The offer, guide calendar or service capacity changed. Ask the travel desk to adjust it.",
      );
    }
  }
  const child = (
      await sql`SELECT plan_id FROM hub_requests WHERE id=${requestId}`
    )[0],
    link = new URL(await privateLink(child.plan_id)),
    url = `${link.origin}/checkout/${requestId}?plan=${child.plan_id}${link.hash}`;
  await notifyBooking(
    requestId,
    `followup-accepted:${f.id}`,
    "Your follow-up itinerary is ready",
    "Your accepted package is ready for checkout. Payment and guide acceptance are confirmed separately.",
  );
  const guide = (await sql`SELECT data FROM guides WHERE id=${f.guide_id}`)[0];
  if (guide)
    await notify(
      `guide-followup:${f.id}`,
      guide.data.email,
      "A traveller accepted your follow-up offer",
      `Review the offered assignment in your guide workspace: ${siteUrl}/guide`,
    );
  await audit(a.actor, "followup.accept", requestId, {
    followup: f.id,
    version,
  });
  if (payNow)
    try {
      return {
        ...(await pay(requestId, mode)),
        planId: child.plan_id,
        editToken: new URLSearchParams(link.hash.slice(1)).get("edit"),
      };
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return {
        url,
        message: error.message,
        planId: child.plan_id,
        editToken: new URLSearchParams(link.hash.slice(1)).get("edit"),
      };
    }
  return {
    url,
    planId: child.plan_id,
    editToken: new URLSearchParams(link.hash.slice(1)).get("edit"),
  };
}
export async function publicDeals() {
  const sql = database();
  return {
    deals:
      await sql`SELECT d.*,c.data->>'name' AS name,c.data->>'image' AS image FROM platform_deals d JOIN hub_catalog c ON c.id=d.item_id WHERE d.active=true AND d.starts_at<=now() AND d.ends_at>now() AND c.status='approved'`,
    services: (await catalog())
      .filter((i) => i.bookable)
      .map((i) => ({ id: i.id, name: i.name })),
  };
}
