import { database } from "@/lib/db";
import { getPlan, editable, audit, notify, privateLink } from "@/lib/hub/store";
import { clientSession, staffSession } from "@/lib/hub/access";
import { HttpError, hash } from "@/lib/hub/security";
import {
  commerceSchema,
  commerceDefaults,
  type CommerceSettings,
  type Guide,
  guideSchema,
} from "./types";
export async function commerceSettings(): Promise<CommerceSettings> {
  const r = await database()`SELECT data FROM platform_settings WHERE id=true`;
  return r[0] ? commerceSchema.parse(r[0].data) : commerceDefaults;
}
export async function ensureCommerce() {
  await database()`INSERT INTO platform_settings(id,data) VALUES(true,${JSON.stringify(commerceDefaults)}::jsonb) ON CONFLICT DO NOTHING`;
}
export async function booking(
  request: Request,
  id: string,
  options: { guide?: boolean; staff?: boolean } = { guide: true, staff: true },
) {
  const sql = database();
  const r = (
    await sql`SELECT r.*,p.data AS plan,p.version AS plan_version,p.client_id FROM hub_requests r JOIN hub_plans p ON p.id=r.plan_id WHERE r.id=${id}`
  )[0];
  if (!r) throw new HttpError(404, "Booking not found.");
  const staff = await staffSession();
  if (
    options.staff !== false &&
    staff &&
    ["owner", "manager"].includes(staff.role)
  )
    return { request: r, actor: staff.id, role: staff.role, staff };
  if (options.guide !== false && staff?.role === "guide") {
    const a = (
      await sql`SELECT a.*,g.user_id FROM guide_assignments a JOIN guides g ON g.id=a.guide_id WHERE a.request_id=${id} AND g.status<>'removed' AND g.user_id=${staff.id} AND a.status IN ('accepted','started','completion_requested','completed') ORDER BY a.created_at DESC LIMIT 1`
    )[0];
    if (a && ["confirmed", "completed"].includes(r.status))
      return {
        request: r,
        actor: staff.id,
        role: "guide",
        staff,
        assignment: a,
      };
    throw new HttpError(403, "This booking is not assigned to you.");
  }
  const user = await clientSession();
  await editable(r.plan_id, request.headers.get("x-plan-key") || "", user?.id);
  return { request: r, actor: user?.id || "client", role: "client", user };
}
export async function ownedGuide(id?: string) {
  const staff = await staffSession();
  if (!staff) throw new HttpError(401, "Guide sign-in is required.");
  const sql = database();
  const row =
    (staff.role === "owner" || staff.role === "manager") && id
      ? (await sql`SELECT * FROM guides WHERE id=${id}`)[0]
      : (
          await sql`SELECT * FROM guides WHERE user_id=${staff.id} AND status<>'removed'`
        )[0];
  if (!row)
    throw new HttpError(403, "Guide profile not assigned to this account.");
  return { staff, row, guide: guideSchema.parse(row.data) };
}
export function contactUnlocked(r: Record<string, any>) {
  return (
    Number(r.paid_minor) > 0 ||
    ["voucher-paid", "cash-paid"].includes(r.payment_status)
  );
}
export function scrubContacts(v: string) {
  return v
    .replace(
      /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi,
      "[contact available after payment]",
    )
    .replace(/(?:\+?\d[\d\s().-]{6,}\d)/g, "[contact available after payment]")
    .replace(
      /https?:\/\/(?:wa\.me|t\.me|api\.whatsapp\.com)\/\S+/gi,
      "[contact available after payment]",
    );
}
export function publicGuide(row: Record<string, any>) {
  const g = guideSchema.parse(row.data);
  return {
    id: g.id,
    name: g.name,
    photo: g.photo,
    bio: scrubContacts(g.bio),
    bioRu: scrubContacts(g.bioRu),
    languages: g.languages,
    specialties: g.specialties,
    areas: g.areas,
    certifications: g.certifications,
    rateType: g.rateType,
    rateMinor: g.rateMinor,
    currency: g.currency,
    rating: row.rating ? Number(row.rating) : null,
    reviewCount: Number(row.review_count || 0),
  };
}
export async function guidesPublic(id?: string) {
  const sql = database();
  const rows = id
    ? await sql`SELECT g.id,g.data,avg(r.rating) FILTER(WHERE r.status='approved') AS rating,count(r.id) FILTER(WHERE r.status='approved') AS review_count FROM guides g LEFT JOIN guide_assignments a ON a.guide_id=g.id LEFT JOIN guide_reviews r ON r.assignment_id=a.id WHERE g.status='active' AND g.id=${id} GROUP BY g.id`
    : await sql`SELECT g.id,g.data,avg(r.rating) FILTER(WHERE r.status='approved') AS rating,count(r.id) FILTER(WHERE r.status='approved') AS review_count FROM guides g LEFT JOIN guide_assignments a ON a.guide_id=g.id LEFT JOIN guide_reviews r ON r.assignment_id=a.id WHERE g.status='active' GROUP BY g.id ORDER BY rating DESC NULLS LAST LIMIT 100`;
  return rows.map(publicGuide);
}
export async function paymentLink(requestId: string) {
  const r = (
    await database()`SELECT plan_id FROM hub_requests WHERE id=${requestId}`
  )[0];
  if (!r) throw new HttpError(404, "Booking not found.");
  const link = new URL(await privateLink(r.plan_id));
  return `${link.origin}/checkout/${requestId}?plan=${r.plan_id}${link.hash}`;
}
export async function notifyBooking(
  requestId: string,
  id: string,
  subject: string,
  body: string,
  includeClient = true,
) {
  const sql = database();
  const r = (
    await sql`SELECT r.guest,r.plan_id,s.email AS manager FROM hub_requests r LEFT JOIN staff_roles s ON s.user_id=r.assigned_to WHERE r.id=${requestId}`
  )[0];
  if (!r) return;
  const link = await privateLink(r.plan_id);
  if (includeClient)
    await notify(`${id}:client`, r.guest.email, subject, `${body}\n${link}`);
  if (r.manager || process.env.ALERT_TO)
    await notify(
      `${id}:manager`,
      r.manager || process.env.ALERT_TO!,
      subject,
      `${body}\n/admin/hub`,
    );
  const guide = (
    await sql`SELECT g.data FROM guides g JOIN guide_assignments a ON a.guide_id=g.id WHERE a.request_id=${requestId} AND a.status IN ('accepted','started','completion_requested') ORDER BY a.created_at DESC LIMIT 1`
  )[0];
  if (guide?.data.email)
    await notify(
      `${id}:guide`,
      guide.data.email,
      subject,
      `${body}\nOpen your guide dashboard.`,
    );
  const links =
    await sql`SELECT b.channel,b.address FROM bot_links b WHERE b.active=true AND b.consent=true AND (b.plan_id=${r.plan_id} OR b.user_id IN (SELECT g.user_id FROM guides g JOIN guide_assignments a ON a.guide_id=g.id WHERE a.request_id=${requestId} AND a.status IN ('accepted','started','completion_requested')))`;
  for (const b of links)
    await notify(
      `${id}:${b.channel}:${hash(b.address).slice(0, 12)}`,
      b.address,
      subject,
      body,
      undefined,
      b.channel,
    );
}
export async function cached<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
): Promise<T> {
  const sql = database();
  const r =
    await sql`SELECT data FROM research_cache WHERE key=${key} AND expires_at>now()`;
  if (r[0]) return r[0].data;
  const value = await load();
  await sql`INSERT INTO research_cache(key,data,expires_at) VALUES(${key},${JSON.stringify(value)}::jsonb,${new Date(Date.now() + ttl * 1000).toISOString()}) ON CONFLICT(key) DO UPDATE SET data=EXCLUDED.data,expires_at=EXCLUDED.expires_at`;
  return value;
}
export async function usage(provider: string) {
  await database()`INSERT INTO hub_provider_usage(provider,requests) VALUES(${provider},1) ON CONFLICT(provider,day) DO UPDATE SET requests=hub_provider_usage.requests+1`;
}

export function redactDeep<T>(value: T): T {
  if (typeof value === "string") return scrubContacts(value) as T;
  if (Array.isArray(value)) return value.map(redactDeep) as T;
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, redactDeep(v)]),
    ) as T;
  return value;
}
