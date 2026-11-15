import { validUnsubscribe } from "./newsletter";
import { routeFor } from "./routing";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { database } from "@/lib/db";
import { siteUrl } from "@/lib/site";
import { revalidatePath } from "next/cache";
import { getWeather } from "@/lib/weather/read";
import {
  clientSession,
  requireStaff,
  staffSession,
  partnerCan,
} from "./access";
import {
  origin,
  body,
  limit,
  HttpError,
  token,
  hash,
  matches,
  safeUrl,
} from "./security";
import {
  catalog,
  settings,
  rates,
  createPlan,
  getPlan,
  editable,
  savePlan,
  saveCatalog,
  audit,
  notify,
  availableSlots,
  privateLink,
} from "./store";
import {
  itemSchema,
  planSchema,
  contactSchema,
  settingsSchema,
  menuItemSchema,
  stages,
  type Plan,
} from "./types";
import { estimate, conflicts } from "./core";
import { createRequest, checkout, confirmArrival, planSlots } from "./bookings";
import { discoverOSM, discoverGoogle, googleDetails } from "./discovery";
import { planPdf } from "./pdf";
import { parseMenuText, parseMenuAI } from "./menu";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const value = (v: unknown, max = 2000) => z.string().trim().max(max).parse(v);
async function planAccess(request: Request, id: string) {
  const user = await clientSession();
  await editable(id, request.headers.get("x-plan-key") || "", user?.id);
  return user;
}
async function requestAccess(request: Request, id: string) {
  const sql = database();
  const rows =
    await sql`SELECT r.*,p.data AS plan,p.version AS plan_version FROM hub_requests r JOIN hub_plans p ON p.id=r.plan_id WHERE r.id=${id}`;
  const row = rows[0];
  if (!row) throw new HttpError(404, "Request not found.");
  await planAccess(request, row.plan_id);
  return row;
}
async function managerRequest(id: string, staff: { id: string; role: string }) {
  const r = (await database()`SELECT * FROM hub_requests WHERE id=${id}`)[0];
  if (!r) throw new HttpError(404, "Request not found.");
  if (staff.role !== "owner" && r.assigned_to !== staff.id)
    throw new HttpError(403, "This request is assigned to another manager.");
  return r;
}
export async function handle(request: Request, path: string[]) {
  const [resource, id, action] = path,
    sql = database();
  const method = request.method;
  if (method === "GET") {
    if (resource === "catalog") {
      const [items, conf, fx, slots] = await Promise.all([
        catalog(),
        settings(),
        rates(),
        availableSlots(),
      ]);
      return json({
        items,
        settings: {
          markup: conf.markup,
          groupThreshold: conf.groupThreshold,
          groupDiscount: conf.groupDiscount,
          seasonal: conf.seasonal,
          transportBase: conf.transportBase,
          transportPerKm: conf.transportPerKm,
          transportConfirmed: conf.transportConfirmed,
          vehicleCapacity: conf.vehicleCapacity,
          payOnArrival: conf.payOnArrival,
        },
        rates: fx,
        slots,
        paymentsConfigured: !!process.env.STRIPE_SECRET_KEY,
      });
    }
    if (resource === "plans" && id) {
      const p = await getPlan(id);
      if (action === "requests") {
        await planAccess(request, id);
        return json({
          requests:
            await sql`SELECT id FROM hub_requests WHERE plan_id=${id} ORDER BY created_at DESC LIMIT 20`,
        });
      }
      if (action === "pdf") {
        const pdfItems = await catalog();
        const bytes = await planPdf(
          p.data,
          pdfItems,
          estimate(p.data, pdfItems, await settings(), await rates()),
        );
        return new Response(Buffer.from(bytes), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition":
              'attachment; filename="almaty-itinerary.pdf"',
            "Cache-Control": "no-store",
          },
        });
      }
      return json(p);
    }
    if (resource === "requests" && id) {
      const r = await requestAccess(request, id);
      const quotes = r.quote_id
        ? await sql`SELECT id,plan_version,breakdown,amount_minor,currency,deposit_percent,terms,status,expires_at FROM hub_quotes WHERE id=${r.quote_id}`
        : [];
      const messages =
        await sql`SELECT id,actor,body,created_at FROM hub_messages WHERE request_id=${id} AND visibility='client' ORDER BY created_at LIMIT 200`;
      return json({
        request: {
          id: r.id,
          status: r.status,
          paymentStatus: r.payment_status,
          paidMinor: r.paid_minor,
          version: r.version,
        },
        quote: quotes[0] || null,
        messages,
      });
    }
    if (resource === "account") {
      const user = await clientSession();
      if (!user) throw new HttpError(401, "Sign in to see your saved plans.");
      return json({
        plans:
          await sql`SELECT id,data->>'title' AS title,data->>'startDate' AS start_date,version FROM hub_plans WHERE client_id=${user.id} ORDER BY last_seen DESC LIMIT 100`,
      });
    }
    if (resource === "reviews")
      return json({
        reviews:
          await sql`SELECT rating,body,created_at FROM hub_reviews WHERE status='approved' ORDER BY created_at DESC LIMIT 30`,
      });
    if (resource === "admin") {
      const staff = await requireStaff(["owner", "manager", "partner"]);
      const items = await catalog(true);
      if (staff.role === "partner")
        return json({
          staff,
          items: items.filter((i) => staff.restaurantIds.includes(i.id)),
          menuDrafts:
            await sql`SELECT id,item_id,data,status,created_at FROM hub_menu_drafts WHERE actor=${staff.id} ORDER BY created_at DESC LIMIT 30`,
        });
      const requests =
        staff.role === "owner"
          ? await sql`SELECT r.*,p.data AS plan,p.version AS plan_version,q.amount_minor AS quote_amount,q.currency AS quote_currency,q.terms AS quote_terms FROM hub_requests r JOIN hub_plans p ON p.id=r.plan_id LEFT JOIN hub_quotes q ON q.id=r.quote_id ORDER BY r.created_at DESC LIMIT 200`
          : await sql`SELECT r.*,p.data AS plan,p.version AS plan_version,q.amount_minor AS quote_amount,q.currency AS quote_currency,q.terms AS quote_terms FROM hub_requests r JOIN hub_plans p ON p.id=r.plan_id LEFT JOIN hub_quotes q ON q.id=r.quote_id WHERE r.assigned_to=${staff.id} ORDER BY r.created_at DESC LIMIT 200`;
      const requestIds = requests.map((r) => r.id);
      const messages = requestIds.length
        ? await sql`SELECT id,request_id,actor,visibility,body,created_at FROM hub_messages WHERE request_id=ANY(${requestIds}::text[]) ORDER BY created_at DESC LIMIT 500`
        : [];
      const [conf, slots, staffRows] = await Promise.all([
        settings(),
        availableSlots(),
        sql`SELECT s.user_id,s.email,s.role,p.restaurant_ids,p.languages FROM staff_roles s LEFT JOIN hub_staff_profiles p ON p.user_id=s.user_id ORDER BY s.role,s.email`,
      ]);
      const currentWeather = await getWeather().catch(() => null);
      const base = {
        weather: currentWeather?.stale ? null : currentWeather?.weather,
        staff,
        items,
        requests,
        messages,
        settings: conf,
        slots,
        staffRows,
      };
      if (staff.role !== "owner") return json(base);
      return json({
        ...base,
        candidates:
          await sql`SELECT id,source_key,external_id,kind,data,status FROM content_candidates WHERE status='pending' ORDER BY updated_at DESC LIMIT 150`,
        menuDrafts:
          await sql`SELECT id,item_id,data,actor,status,created_at FROM hub_menu_drafts WHERE status='pending' ORDER BY created_at DESC LIMIT 100`,
        reviews:
          await sql`SELECT id,request_id,rating,body,status FROM hub_reviews ORDER BY created_at DESC LIMIT 100`,
        notifications:
          await sql`SELECT id,channel,subject,status,attempts,last_error,created_at FROM hub_notifications ORDER BY created_at DESC LIMIT 30`,
        analytics: await analytics(),
        audit:
          await sql`SELECT actor,action,resource,details,created_at FROM admin_audit ORDER BY created_at DESC LIMIT 100`,
        configured: {
          stripe: !!process.env.STRIPE_SECRET_KEY,
          email: !!(
            process.env.RESEND_API_KEY &&
            (process.env.CONTACT_FROM || process.env.ALERT_FROM)
          ),
          places: !!process.env.GOOGLE_PLACES_API_KEY,
          menuAI: !!(
            process.env.MENU_AI_URL &&
            process.env.MENU_AI_KEY &&
            process.env.MENU_AI_MODEL
          ),
        },
      });
    }
    if (resource === "google" && id) {
      await requireStaff(["owner"]);
      return json({
        details: await googleDetails(id),
        attribution:
          "Google Maps · fetched live; do not copy provider content into the catalog.",
      });
    }
    throw new HttpError(404, "Not found.");
  }
  origin(request);
  if (resource === "menu-import") {
    const staff = await requireStaff(["owner", "manager", "partner"]);
    await limit(request, "menu-import", 20);
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      if (Number(request.headers.get("content-length") || 0) > 4500000)
        throw new HttpError(413, "Menu file is too large.");
      const form = await request.formData(),
        file = form.get("file");
      if (!(file instanceof File))
        throw new HttpError(400, "Choose a menu file.");
      return json({ items: await parseMenuAI(file), reviewRequired: true });
    }
    const b = await body(request);
    return json({
      items: parseMenuText(value(b.text, 50000)),
      reviewRequired: true,
      actor: staff.id,
    });
  }
  const b = await body(request);
  if (resource === "plans" && !id) {
    await limit(request, "plan-create", 20);
    const plan = planSchema.parse(b.plan);
    const user = await clientSession();
    return json(await createPlan(plan, user?.id), 201);
  }
  if (resource === "plans" && id) {
    const user = await planAccess(request, id);
    if (b.action === "save") {
      const plan = planSchema.parse(b.plan);
      const version = z.number().int().positive().parse(b.version);
      return json({ version: await savePlan(id, plan, version, user?.id) });
    }
    if (b.action === "email") {
      await limit(request, "plan-email", 3);
      const email = z.email().parse(b.email),
        p = await getPlan(id);
      await sql`UPDATE hub_plans SET email=${email},reminder_consent=${b.reminderConsent === true},last_seen=now() WHERE id=${id}`;
      await notify(
        `email-plan:${id}:${hash(email).slice(0, 12)}`,
        email,
        "Your saved Almaty plan",
        `${p.data.title}\n${await privateLink(id)}\nThis private link grants edit access. Keep it safe. A separate public share link contains no contact details.`,
      );
      return json({ queued: true });
    }
    if (b.action === "account") {
      if (!user) throw new HttpError(401, "Sign in before linking this plan.");
      const current = (
        await sql`SELECT client_id FROM hub_plans WHERE id=${id}`
      )[0];
      if (current.client_id && current.client_id !== user.id)
        throw new HttpError(403, "Plan already belongs to another account.");
      await sql`UPDATE hub_plans SET client_id=${user.id} WHERE id=${id}`;
      return json({ ok: true });
    }
    if (b.action === "request") {
      await limit(request, "booking-request", 8);
      const guest = contactSchema.parse(b.guest);
      const key = z.uuid().parse(b.idempotencyKey);
      return json(
        await createRequest(
          id,
          guest,
          b.intent === "adjustment" ? "adjustment" : "booking",
          key,
        ),
        201,
      );
    }
    throw new HttpError(400, "Unknown plan action.");
  }
  if (resource === "requests" && id) {
    const r = await requestAccess(request, id);
    await limit(request, "request-action", 40);
    if (b.action === "message") {
      const message = value(b.message, 2000);
      if (!message) throw new HttpError(400, "Write a message.");
      await sql`INSERT INTO hub_messages(request_id,actor,visibility,body) VALUES(${id},'client','client',${message})`;
      return json({ ok: true });
    }
    if (b.action === "approve") {
      const quoteId = value(b.quoteId, 100);
      if (b.viewedVersion !== r.plan_version)
        throw new HttpError(
          409,
          "The manager updated your itinerary. Refresh and review it before approving.",
        );
      const updated =
        await sql`UPDATE hub_quotes SET status='approved',approved_at=now() WHERE id=${quoteId} AND request_id=${id} AND id=${r.quote_id} AND status='pending' AND expires_at>now() AND plan_version=${r.plan_version} RETURNING id`;
      if (!updated.length)
        throw new HttpError(
          409,
          "The quote changed or expired. Ask the manager for a new one.",
        );
      return json({ ok: true });
    }
    if (b.action === "checkout")
      return json(await checkout(id, b.mode === "full" ? "full" : "deposit"));
    if (b.action === "arrival") return json(await confirmArrival(id));
    if (b.action === "cancel") {
      await sql.transaction([
        sql`UPDATE hub_requests SET status='cancelled',payment_status=CASE WHEN paid_minor>0 THEN 'refund-review' ELSE payment_status END,updated_at=now() WHERE id=${id}`,
        sql`UPDATE hub_holds SET state='released' WHERE request_id=${id}`,
        sql`INSERT INTO hub_messages(request_id,actor,visibility,body) VALUES(${id},'client','client','Cancellation requested. Any refund requires review under the accepted quote terms.')`,
      ]);
      if (process.env.ALERT_TO)
        await notify(
          `cancel:${id}`,
          process.env.ALERT_TO,
          "Booking cancellation requested",
          `Review ${id} at ${siteUrl}/admin/hub`,
        );
      return json({ ok: true });
    }
    if (b.action === "reschedule") {
      const message = value(b.message, 1000);
      await sql`INSERT INTO hub_messages(request_id,actor,visibility,body) VALUES(${id},'client','client',${`Free weather reschedule / alternative request: ${message}`})`;
      if (process.env.ALERT_TO)
        await notify(
          `reschedule:${id}:${randomUUID()}`,
          process.env.ALERT_TO,
          "Reschedule requested",
          `Review ${id} at ${siteUrl}/admin/hub`,
        );
      return json({ ok: true });
    }
    if (b.action === "review") {
      if (r.status !== "completed")
        throw new HttpError(409, "Reviews open after a completed booking.");
      const rating = z.number().int().min(1).max(5).parse(b.rating),
        text = value(b.text, 1500);
      await sql`INSERT INTO hub_reviews(id,request_id,rating,body) VALUES(${randomUUID()},${id},${rating},${text}) ON CONFLICT(request_id) DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body,status='pending'`;
      return json({ ok: true });
    }
    throw new HttpError(400, "Unknown request action.");
  }
  if (resource === "newsletter") {
    await limit(request, "newsletter", 3);
    if (b.action === "confirm" || b.action === "unsubscribe") {
      const sub = (
        await sql`SELECT id,token_hash FROM hub_subscribers WHERE id=${value(b.id, 100)}`
      )[0];
      if (
        !sub ||
        !(
          matches(value(b.token, 200), sub.token_hash) ||
          (b.action === "unsubscribe" &&
            validUnsubscribe(sub.id, value(b.token, 200)))
        )
      )
        throw new HttpError(400, "This preference link is invalid.");
      await sql`UPDATE hub_subscribers SET confirmed=true,active=${b.action === "confirm"} WHERE id=${sub.id}`;
      return json({ ok: true });
    }
    const email = z.email().parse(b.email);
    if (b.consent !== true) throw new HttpError(400, "Consent is required.");
    const code = token(),
      subId = randomUUID();
    const rows =
      await sql`INSERT INTO hub_subscribers(id,email,token_hash,language) VALUES(${subId},${email},${hash(code)},${b.language === "ru" ? "ru" : "en"}) ON CONFLICT(email) DO UPDATE SET token_hash=EXCLUDED.token_hash RETURNING id`;
    await notify(
      `newsletter-confirm:${rows[0].id}:${hash(code).slice(0, 8)}`,
      email,
      "Confirm your Almaty daily digest",
      `Confirm your daily travel email, or unsubscribe, here:\n${siteUrl}/privacy?subscriber=${rows[0].id}&token=${code}\nKeep this link to manage your email preferences.`,
    );
    return json({ queued: true });
  }
  if (resource === "route") {
    await limit(request, "route", 40);
    return json(
      await routeFor(
        z.array(z.string().max(120)).min(1).max(25).parse(b.itemIds),
      ),
    );
  }
  if (resource === "analytics") {
    await limit(request, "analytics", 120);
    if (b.consent !== true) return json({ ok: true });
    const event = z
      .enum(["visitor", "itinerary-created", "added", "removed", "booked"])
      .parse(b.event);
    await sql`INSERT INTO hub_analytics(event,item_id) VALUES(${event},${typeof b.itemId === "string" ? b.itemId.slice(0, 120) : null})`;
    return json({ ok: true });
  }
  if (resource === "admin") {
    const staff = await requireStaff(["owner", "manager", "partner"]);
    if (b.action === "menu") {
      const itemId = value(b.itemId, 120);
      if (!partnerCan(staff, itemId))
        throw new HttpError(403, "This restaurant is not assigned to you.");
      const items = z.array(menuItemSchema).max(300).parse(b.items);
      const draftId = randomUUID();
      await sql`INSERT INTO hub_menu_drafts(id,item_id,data,actor) VALUES(${draftId},${itemId},${JSON.stringify({ items, currency: z.enum(["KZT", "USD", "EUR", "RUB", "GBP"]).parse(b.currency || "KZT") })}::jsonb,${staff.id})`;
      await audit(staff.id, "menu.draft", itemId);
      return json({ id: draftId, reviewRequired: true });
    }
    if (staff.role === "partner")
      throw new HttpError(
        403,
        "Partners can submit assigned restaurant menus only.",
      );
    if (b.action === "request") {
      const r = await managerRequest(value(b.id, 100), staff);
      const status = z.enum(stages).parse(b.status);
      const assigned =
        staff.role === "owner" ? value(b.assignedTo || "", 100) : r.assigned_to;
      if (assigned) {
        const allowed =
          await sql`SELECT role FROM staff_roles WHERE user_id=${assigned} AND role IN ('owner','manager')`;
        if (!allowed.length)
          throw new HttpError(400, "Choose an approved manager.");
      }
      if (status === "confirmed" && r.status !== "confirmed")
        throw new HttpError(
          409,
          "Confirmation requires an approved quote and a payment or pay-on-arrival capacity check.",
        );
      await sql`UPDATE hub_requests SET status=${status},payment_status=CASE WHEN ${status}='cancelled' AND paid_minor>0 THEN 'refund-review' ELSE payment_status END,assigned_to=${assigned || null},contacted_at=CASE WHEN ${status}<>'new' THEN COALESCE(contacted_at,now()) ELSE contacted_at END,version=version+1,updated_at=now() WHERE id=${r.id}`;
      if (status === "cancelled")
        await sql`UPDATE hub_holds SET state='released' WHERE request_id=${r.id}`;
      if (b.note)
        await sql`INSERT INTO hub_messages(request_id,actor,visibility,body) VALUES(${r.id},${staff.id},'internal',${value(b.note, 2000)})`;
      await audit(staff.id, "request.status", r.id, { status });
      return json({ ok: true });
    }
    if (b.action === "message") {
      const r = await managerRequest(value(b.id, 100), staff),
        message = value(b.message, 2000);
      if (!message) throw new HttpError(400, "Write a message.");
      const visibility = b.visibility === "internal" ? "internal" : "client";
      await sql`INSERT INTO hub_messages(request_id,actor,visibility,body) VALUES(${r.id},${staff.id},${visibility},${message})`;
      await sql`UPDATE hub_requests SET contacted_at=COALESCE(contacted_at,now()),status=CASE WHEN status='new' THEN 'contacted' ELSE status END WHERE id=${r.id}`;
      if (visibility === "client")
        await notify(
          `reply:${r.id}:${randomUUID()}`,
          r.guest.email,
          "A message from your Almaty manager",
          `${message}\n\nOpen your private plan and reply: ${await privateLink(r.plan_id)}`,
        );
      return json({ ok: true });
    }
    if (b.action === "quote") {
      const r = await managerRequest(value(b.id, 100), staff);
      if (["cancelled", "completed"].includes(r.status))
        throw new HttpError(
          409,
          "This request is closed. Create a new request for another trip.",
        );
      const p = await getPlan(r.plan_id),
        plan = planSchema.parse(b.plan);
      const version = z.number().int().positive().parse(b.version);
      if (version !== p.version)
        throw new HttpError(
          409,
          "The itinerary changed. Reload before quoting.",
        );
      const amount = z.number().int().min(0).max(100000000).parse(b.amount),
        currency = z
          .enum(["KZT", "USD", "EUR", "RUB", "GBP"])
          .parse(b.currency),
        terms = value(b.terms, 5000),
        deposit = z.number().int().min(1).max(100).parse(b.depositPercent);
      if (Number(r.paid_minor) > 0 && r.currency !== currency)
        throw new HttpError(
          409,
          "Settlement currency cannot change after a payment. Resolve the existing payment first.",
        );
      const items = await catalog();
      await planSlots(plan, items);
      const breakdown = estimate(plan, items, await settings(), await rates());
      const quoteId = randomUUID();
      const newVersion = await savePlan(r.plan_id, plan, p.version);
      await sql.transaction([
        sql`UPDATE hub_quotes SET status='superseded' WHERE request_id=${r.id} AND status IN ('pending','approved')`,
        sql`INSERT INTO hub_quotes(id,request_id,plan_version,plan,breakdown,amount_minor,currency,deposit_percent,terms) VALUES(${quoteId},${r.id},${newVersion},${JSON.stringify(plan)}::jsonb,${JSON.stringify({ estimate: breakdown, adjustmentNote: value(b.adjustmentNote || "", 1000) })}::jsonb,${amount},${currency},${deposit},${terms})`,
        sql`UPDATE hub_requests SET quote_id=${quoteId},currency=${currency},status='quote-sent',version=version+1,contacted_at=COALESCE(contacted_at,now()),updated_at=now() WHERE id=${r.id}`,
      ]);
      await audit(staff.id, "quote.send", r.id, {
        quoteId,
        amount,
        currency,
        newVersion,
      });
      await notify(
        `quote:${quoteId}`,
        r.guest.email,
        "Your final Almaty quote is ready",
        `Your manager has updated your plan and final quote. Review and approve it on your private link:\n${await privateLink(r.plan_id)}\nTotal: ${(amount / 100).toFixed(2)} ${currency}. Deposit: ${deposit}%.\n${terms}`,
      );
      return json({ ok: true, quoteId });
    }
    if (staff.role !== "owner")
      throw new HttpError(403, "Owner access required.");
    if (b.action === "catalog") {
      const item = itemSchema.parse(b.item);
      item.image = safeUrl(item.image);
      item.website = safeUrl(item.website);
      item.sourceUrl = safeUrl(item.sourceUrl);
      item.menu = item.menu.map((m) => ({ ...m, photo: safeUrl(m.photo) }));
      await saveCatalog(item, staff);
      revalidatePath("/");
      return json({ ok: true });
    }
    if (b.action === "settings") {
      const conf = settingsSchema.parse(b.settings);
      await sql`UPDATE hub_settings SET data=${JSON.stringify(conf)}::jsonb,updated_at=now() WHERE id=true`;
      await audit(staff.id, "settings.save", "hub");
      revalidatePath("/");
      return json({ ok: true });
    }
    if (b.action === "discovery") {
      await limit(request, "discovery", 4);
      return json({ osm: await discoverOSM(), google: await discoverGoogle() });
    }
    if (b.action === "approve-menu") {
      const draft = (
        await sql`SELECT * FROM hub_menu_drafts WHERE id=${value(b.id, 100)} AND status='pending'`
      )[0];
      if (!draft) throw new HttpError(404, "Menu draft not found.");
      const item = (await catalog(true)).find((i) => i.id === draft.item_id);
      if (!item) throw new HttpError(404, "Restaurant not found.");
      const menu = z
        .array(menuItemSchema)
        .parse(draft.data.items)
        .map((m) => ({ ...m, photo: safeUrl(m.photo) }));
      await saveCatalog(
        {
          ...item,
          menu,
          menuCurrency: draft.data.currency,
          menuUpdatedAt: new Date().toISOString(),
        },
        staff,
      );
      await sql`UPDATE hub_menu_drafts SET status='approved' WHERE id=${draft.id}`;
      return json({ ok: true });
    }
    if (b.action === "candidate") {
      const c = (
        await sql`SELECT * FROM content_candidates WHERE id=${z.number().int().parse(b.id)}`
      )[0];
      if (!c) throw new HttpError(404, "Candidate not found.");
      if (b.status === "hidden") {
        await sql`UPDATE content_candidates SET status='hidden',published_data=NULL WHERE id=${c.id}`;
        return json({ ok: true });
      }
      if (c.kind === "events") {
        const { normalizeEvent } = await import("@/lib/event-core");
        const event = normalizeEvent(b.data || c.data);
        if (!event)
          throw new HttpError(
            400,
            "A valid dated event and source URL are required.",
          );
        await sql`UPDATE content_candidates SET data=${JSON.stringify(event)}::jsonb,published_data=${JSON.stringify(event)}::jsonb,status='approved' WHERE id=${c.id}`;
      } else if (c.kind === "places" || c.kind === "restaurants") {
        const item = itemSchema.parse({ ...b.data, status: "approved" });
        await saveCatalog(item, staff);
        await sql`UPDATE content_candidates SET status='approved' WHERE id=${c.id}`;
      } else if (c.kind === "menus") {
        const menu = z
          .object({
            itemId: z.string().max(120),
            items: z.array(menuItemSchema).max(300),
            currency: z.enum(["KZT", "USD", "EUR", "RUB", "GBP"]),
          })
          .parse(b.data || c.data);
        const item = (await catalog(true)).find((i) => i.id === menu.itemId);
        if (!item) throw new HttpError(400, "Choose an existing restaurant.");
        await saveCatalog(
          {
            ...item,
            menu: menu.items.map((m) => ({ ...m, photo: safeUrl(m.photo) })),
            menuCurrency: menu.currency,
            menuUpdatedAt: new Date().toISOString(),
          },
          staff,
        );
        await sql`UPDATE content_candidates SET status='approved',published_data=data WHERE id=${c.id}`;
      } else if (c.kind === "prices") {
        const priceRecord = z
          .object({
            itemId: z.string().max(120),
            price: itemSchema.shape.price,
          })
          .parse(b.data || c.data);
        const item = (await catalog(true)).find(
          (i) => i.id === priceRecord.itemId,
        );
        if (!item) throw new HttpError(400, "Choose an existing catalog item.");
        await saveCatalog({ ...item, price: priceRecord.price }, staff);
        await sql`UPDATE content_candidates SET status='approved',published_data=data WHERE id=${c.id}`;
      } else throw new HttpError(400, "Unsupported record kind.");
      return json({ ok: true });
    }
    if (b.action === "slot") {
      const slot = z
        .object({
          id: z.string().max(100),
          itemId: z.string().max(120),
          start: z.iso.datetime(),
          end: z.iso.datetime(),
          capacity: z.number().int().min(1).max(1000),
          blackout: z.boolean(),
        })
        .parse(b.slot);
      if (new Date(slot.end) <= new Date(slot.start))
        throw new HttpError(400, "End time must follow start time.");
      const changed =
        await sql`INSERT INTO hub_slots(id,item_id,starts_at,ends_at,capacity,blackout) VALUES(${slot.id || randomUUID()},${slot.itemId},${slot.start},${slot.end},${slot.capacity},${slot.blackout}) ON CONFLICT(id) DO UPDATE SET capacity=EXCLUDED.capacity,blackout=EXCLUDED.blackout WHERE EXCLUDED.capacity>=(SELECT COALESCE(sum(quantity),0) FROM hub_holds WHERE slot_id=hub_slots.id AND (state='confirmed' OR (state='held' AND expires_at>now()))) RETURNING id`;
      if (!changed.length)
        throw new HttpError(
          409,
          "Capacity cannot be lower than existing active reservations.",
        );
      await audit(staff.id, "inventory.save", slot.itemId);
      return json({ ok: true });
    }
    if (b.action === "staff") {
      const email = z.email().parse(b.email),
        role = z.enum(["manager", "partner"]).parse(b.role);
      const user = (
        await sql`SELECT id,email FROM neon_auth."user" WHERE lower(email)=lower(${email}) AND "emailVerified"=true`
      )[0];
      if (!user)
        throw new HttpError(
          400,
          "This user must first sign in and verify their email.",
        );
      if (
        (await sql`SELECT role FROM staff_roles WHERE user_id=${user.id}`)[0]
          ?.role === "owner"
      )
        throw new HttpError(400, "Owner roles cannot be changed here.");
      const ids = z
          .array(z.string().max(120))
          .max(50)
          .parse(b.restaurantIds || []),
        languages = z
          .array(z.enum(["en", "ru"]))
          .max(2)
          .parse(b.languages || ["en"]);
      await sql.transaction([
        sql`INSERT INTO staff_roles(user_id,email,role) VALUES(${user.id},${user.email},${role}) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role`,
        sql`INSERT INTO hub_staff_profiles(user_id,restaurant_ids,languages) VALUES(${user.id},${JSON.stringify(ids)}::jsonb,${JSON.stringify(languages)}::jsonb) ON CONFLICT(user_id) DO UPDATE SET restaurant_ids=EXCLUDED.restaurant_ids,languages=EXCLUDED.languages`,
      ]);
      await audit(staff.id, "staff.assign", user.id, { role });
      return json({ ok: true });
    }
    if (b.action === "review") {
      await sql`UPDATE hub_reviews SET status=${b.status === "approved" ? "approved" : "hidden"} WHERE id=${value(b.id, 100)}`;
      return json({ ok: true });
    }
    if (b.action === "event") {
      const { normalizeEvent } = await import("@/lib/event-core");
      const event = normalizeEvent(b.event);
      if (!event)
        throw new HttpError(
          400,
          "Use the event data contract with a valid date and source URL.",
        );
      await sql`INSERT INTO content_candidates(source_key,external_id,kind,data,published_data,status) VALUES('owner.events',${event.id},'events',${JSON.stringify(event)}::jsonb,${JSON.stringify(event)}::jsonb,'approved') ON CONFLICT(source_key,external_id) DO UPDATE SET data=EXCLUDED.data,published_data=EXCLUDED.data,status='approved'`;
      return json({ ok: true });
    }
    throw new HttpError(400, "Unknown staff action.");
  }
  throw new HttpError(404, "Not found.");
}
async function analytics() {
  const sql = database();
  return {
    events:
      await sql`SELECT event,count(*)::int AS count FROM hub_analytics WHERE created_at>now()-interval '30 days' GROUP BY event`,
    places: [
      ...(await sql`SELECT event,item_id,count(*)::int AS count FROM hub_analytics WHERE item_id IS NOT NULL AND event IN ('added','removed') AND created_at>now()-interval '30 days' GROUP BY event,item_id ORDER BY count DESC LIMIT 50`),
      ...(await sql`SELECT 'booked' AS event,stop->>'itemId' AS item_id,count(DISTINCT r.id)::int AS count FROM hub_requests r JOIN hub_plans p ON p.id=r.plan_id CROSS JOIN LATERAL jsonb_array_elements(p.data->'days') AS day CROSS JOIN LATERAL jsonb_array_elements(day->'stops') AS stop WHERE r.status IN ('confirmed','completed') AND r.created_at>now()-interval '30 days' GROUP BY stop->>'itemId' ORDER BY count DESC LIMIT 20`),
    ],
    orders: (
      await sql`SELECT count(*)::int AS requests,count(*) FILTER(WHERE status IN ('confirmed','completed'))::int AS confirmed,COALESCE(sum(paid_minor),0)::text AS revenue FROM hub_requests`
    )[0],
    currencies:
      await sql`SELECT currency,COALESCE(sum(paid_minor),0)::text AS revenue,count(*) FILTER(WHERE paid_minor>0)::int AS paid_orders FROM hub_requests GROUP BY currency`,
    camera:
      await sql`SELECT c.id,c.status,count(h.id)::int AS checks,count(h.id) FILTER(WHERE h.ok)::int AS successful FROM cameras c LEFT JOIN camera_checks h ON h.camera_id=c.id AND h.checked_at>now()-interval '7 days' GROUP BY c.id`,
    updates:
      await sql`SELECT source_key,sum(requests)::int AS requests,count(*) FILTER(WHERE status='failed')::int AS failures FROM update_source_runs r JOIN update_runs u ON u.id=r.run_id WHERE u.started_at>now()-interval '30 days' GROUP BY source_key`,
  };
}
