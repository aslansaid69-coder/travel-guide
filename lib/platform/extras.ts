import { randomUUID } from "node:crypto";
import { database } from "@/lib/db";
import { clientSession } from "@/lib/hub/access";
import {
  createPlan,
  notify,
  audit,
  catalog,
  availableSlots,
  privateLink,
} from "@/lib/hub/store";
import { createRequest } from "@/lib/hub/bookings";
import { hash, token, HttpError } from "@/lib/hub/security";
import { planSchema, contactSchema } from "@/lib/hub/types";
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
export async function acceptFollowup(
  request: Request,
  id: string,
  followupId: string,
) {
  const a = await booking(request, id, { staff: false, guide: false }),
    sql = database(),
    f = (
      await sql`SELECT * FROM guide_followups WHERE id=${followupId} AND request_id=${id} AND status='approved'`
    )[0];
  if (!f) throw new HttpError(409, "This follow-up is not approved.");
  if (f.new_request_id) {
    const old = (
      await sql`SELECT plan_id FROM hub_requests WHERE id=${f.new_request_id}`
    )[0];
    return { url: await privateLink(old.plan_id) };
  }
  const g = contactSchema.parse(a.request.guest),
    plan = planSchema.parse(f.data.plan);
  const saved = await createPlan(plan, a.user?.id);
  const created = await createRequest(
    saved.id,
    g,
    "booking",
    `followup:${f.id}`,
  );
  await sql`UPDATE guide_followups SET new_request_id=${created.id},status='accepted' WHERE id=${followupId} AND status='approved'`;
  return { url: `/trip/${saved.id}#edit=${saved.editToken}` };
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
