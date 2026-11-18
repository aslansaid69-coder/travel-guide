import { siteUrl } from "@/lib/site";
import { randomUUID } from "node:crypto";
import { database } from "@/lib/db";
import {
  itemSchema,
  settingsSchema,
  defaultSettings,
  type CatalogItem,
  type Plan,
  type Staff,
  type HubSettings,
  type Rates,
} from "./types";
import { token, hash, matches, HttpError } from "./security";
export async function catalog(all = false): Promise<CatalogItem[]> {
  const sql = database();
  const rows = all
    ? await sql`SELECT data,status FROM hub_catalog ORDER BY (data->>'sort')::int DESC,updated_at DESC LIMIT 500`
    : await sql`SELECT data,status FROM hub_catalog WHERE status='approved' AND COALESCE((data->>'closed')::boolean,false)=false ORDER BY (data->>'sort')::int DESC,updated_at DESC LIMIT 500`;
  return rows.map((r) => itemSchema.parse({ ...r.data, status: r.status }));
}
export async function settings(): Promise<HubSettings> {
  const rows = await database()`SELECT data FROM hub_settings WHERE id=true`;
  const commerce =
    await database()`SELECT data FROM platform_settings WHERE id=true`.catch(
      () => [],
    );
  const pricing = commerce[0]?.data;
  return settingsSchema.parse({
    ...defaultSettings,
    ...rows[0]?.data,
    weekdayAdjustments: pricing?.dynamicPricing
      ? pricing.weekdayAdjustments
      : {},
  });
}
export async function rates(): Promise<Rates | null> {
  const rows =
    await database()`SELECT data FROM source_snapshots WHERE source_key='prices.exchange'`;
  return rows[0]?.data || null;
}
export async function audit(
  actor: string,
  action: string,
  resource: string,
  details: unknown = {},
) {
  await database()`INSERT INTO admin_audit(actor,action,resource,details) VALUES(${actor},${action},${resource},${JSON.stringify(details)}::jsonb)`;
}
export async function saveCatalog(item: CatalogItem, staff: Staff) {
  const sql = database();
  await sql.transaction([
    sql`INSERT INTO hub_catalog(id,data,status,owner_edited) VALUES(${item.id},${JSON.stringify(item)}::jsonb,${item.status},${staff.id !== "auto-publish"}) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data,status=EXCLUDED.status,owner_edited=EXCLUDED.owner_edited,updated_at=now()`,
    sql`INSERT INTO admin_audit(actor,action,resource,details) VALUES(${staff.id},'catalog.save',${item.id},${JSON.stringify({ status: item.status })}::jsonb)`,
  ]);
}
export async function createPlan(plan: Plan, clientId?: string) {
  const id = token().slice(0, 24),
    editToken = token();
  await database()`INSERT INTO hub_plans(id,edit_hash,data,client_id) VALUES(${id},${hash(editToken)},${JSON.stringify(plan)}::jsonb,${clientId || null})`;
  return { id, editToken, version: 1 };
}
export async function getPlan(id: string) {
  const rows =
    await database()`SELECT id,data,version FROM hub_plans WHERE id=${id}`;
  if (!rows[0]) throw new HttpError(404, "Plan not found.");
  return rows[0] as { id: string; data: Plan; version: number };
}
export async function editable(id: string, value: string, userId?: string) {
  const rows =
    await database()`SELECT id,edit_hash,client_id FROM hub_plans WHERE id=${id}`;
  const r = rows[0];
  const emailLink = value
    ? (
        await database()`SELECT token_hash FROM hub_access_links WHERE token_hash=${hash(value)} AND plan_id=${id} AND expires_at>now()`
      )[0]
    : null;
  if (
    !r ||
    !(
      (value && matches(value, r.edit_hash)) ||
      emailLink ||
      (userId && r.client_id === userId)
    )
  )
    throw new HttpError(
      403,
      "This plan needs its private edit link or linked account.",
    );
  return true;
}
export async function savePlan(
  id: string,
  plan: Plan,
  version: number,
  clientId?: string,
) {
  const rows =
    await database()`UPDATE hub_plans SET data=${JSON.stringify(plan)}::jsonb,version=version+1,last_seen=now(),client_id=COALESCE(client_id,${clientId || null}) WHERE id=${id} AND version=${version} RETURNING version`;
  if (!rows[0])
    throw new HttpError(
      409,
      "This plan changed in another window. Reload before saving.",
    );
  return Number(rows[0].version);
}
export async function notify(
  id: string,
  recipient: string,
  subject: string,
  body: string,
  due?: Date,
  channel = "email",
) {
  await database()`INSERT INTO hub_notifications(id,recipient,subject,body,due_at,channel) VALUES(${id},${recipient},${subject.slice(0, 180)},${body},${(due || new Date()).toISOString()},${channel}) ON CONFLICT DO NOTHING`;
}
export async function availableSlots() {
  return database()`SELECT s.id,s.item_id,s.starts_at,s.ends_at,s.capacity,s.blackout,(s.capacity-COALESCE(sum(h.quantity) FILTER(WHERE h.state='confirmed' OR (h.state='held' AND h.expires_at>now())),0))::int AS remaining FROM hub_slots s LEFT JOIN hub_holds h ON h.slot_id=s.id WHERE s.starts_at>now() AND s.starts_at<now()+interval '120 days' GROUP BY s.id ORDER BY s.starts_at LIMIT 500`;
}
export async function assignedManager(language: string) {
  const sql = database();
  const conf = await settings();
  const rows =
    await sql`SELECT s.user_id,s.email,p.languages,count(r.id)::int AS workload FROM staff_roles s LEFT JOIN hub_staff_profiles p ON p.user_id=s.user_id LEFT JOIN hub_requests r ON r.assigned_to=s.user_id AND r.status NOT IN ('completed','cancelled') WHERE s.role IN ('manager','owner') GROUP BY s.user_id,p.languages ORDER BY workload ASC,s.user_id`;
  return (
    (conf.assignment === "language"
      ? rows.find((r) => (r.languages || ["en"]).includes(language))
      : null) ||
    rows[0] ||
    null
  );
}
export async function privateRequest(id: string, planId: string) {
  const rows =
    await database()`SELECT id,plan_id,status,intent,quote_id,payment_status,paid_minor,currency,created_at,updated_at FROM hub_requests WHERE id=${id} AND plan_id=${planId}`;
  if (!rows[0]) throw new HttpError(404, "Request not found.");
  return rows[0];
}

export async function privateLink(planId: string) {
  const key = token();
  await database()`INSERT INTO hub_access_links(token_hash,plan_id) VALUES(${hash(key)},${planId})`;
  return `${siteUrl}/trip/${planId}#edit=${key}`;
}
