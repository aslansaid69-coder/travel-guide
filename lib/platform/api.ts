import { randomUUID } from "node:crypto";
import { z } from "zod";
import { database } from "@/lib/db";
import { clientSession, requireStaff } from "@/lib/hub/access";
import { body, origin, limit, HttpError, hash } from "@/lib/hub/security";
import {
  catalog,
  getPlan,
  editable,
  audit,
  settings,
  rates,
  saveCatalog,
} from "@/lib/hub/store";
import { getWeather } from "@/lib/weather/read";
import {
  booking,
  commerceSettings,
  ownedGuide,
  guidesPublic,
  contactUnlocked,
  redactDeep,
  scrubContacts,
} from "./store";
import { guideSchema, commerceSchema, codeSchema } from "./types";
import {
  research,
  findPrices,
  publishResearch,
  allowedSources,
} from "./research";
import {
  saveGuide,
  inviteGuide,
  claimGuide,
  candidates,
  offerGuide,
  guideAction,
  saveAvailability,
  approveCompletion,
  reassignGuide,
} from "./guides";
import {
  netAmount,
  quoteTerms,
  acceptCheckout,
  pay,
  sendPaymentLink,
  cancelRefund,
} from "./commerce";
import { onboarding, connectStatus, releaseEarnings } from "./payouts";
import { tripData, postMessage, upload, readAsset, safety } from "./trips";
import { assistant, translate } from "./assistant";
import {
  waitlistJoin,
  waitlistConfirm,
  loyalty,
  referral,
  publicDeals,
  createFollowup,
  acceptFollowup,
  approveFollowup,
} from "./extras";
import { documentPdf, pdfResponse } from "./pdf";
const json = (data: unknown) =>
  Response.json(data, { headers: { "Cache-Control": "private, no-store" } });
const str = (v: unknown, max = 200) => z.string().trim().max(max).parse(v);
export async function handlePlatform(request: Request, path: string[]) {
  const [resource, id, action] = path,
    sql = database(),
    url = new URL(request.url);
  if (request.method === "GET") {
    if (resource === "guides") {
      const guides = await guidesPublic(id);
      return json({
        guides,
        reviews: id
          ? await sql`SELECT v.rating,v.body,v.created_at FROM guide_reviews v JOIN guide_assignments a ON a.id=v.assignment_id WHERE a.guide_id=${id} AND v.status='approved' ORDER BY v.created_at DESC LIMIT 50`
          : [],
      });
    }
    if (resource === "deals") return json(await publicDeals());
    if (resource === "loyalty") return json(await loyalty());
    if (resource === "booking" && id) {
      const access = await booking(request, id, { guide: false }),
        r = access.request,
        n = await netAmount(id).catch(() => null),
        quote = r.quote_id
          ? (await sql`SELECT * FROM hub_quotes WHERE id=${r.quote_id}`)[0]
          : null;
      const terms = quote
        ? (
            await sql`SELECT data FROM platform_quote_terms WHERE quote_id=${quote.id}`
          )[0]?.data ||
          quoteTerms(
            Number(quote.amount_minor),
            await commerceSettings(),
            quote.currency,
          )
        : null;
      const items = await catalog(),
        weather = await getWeather().catch(() => null);
      const assigned = (
        await sql`SELECT a.status,g.data->>'name' AS name,g.id FROM guide_assignments a JOIN guides g ON g.id=a.guide_id WHERE a.request_id=${id} AND a.status IN ('accepted','started','completion_requested','completed') ORDER BY a.created_at DESC LIMIT 1`
      )[0];
      return json({
        request: {
          id: r.id,
          planId: r.plan_id,
          status: r.status,
          paymentStatus: r.payment_status,
          paidMinor: Number(r.paid_minor),
          guest: r.guest,
        },
        plan: r.plan,
        plan_version: r.plan_version,
        quote,
        terms,
        checkout:
          (
            await sql`SELECT promo_code,voucher_code,terms_version,terms_accepted_at FROM platform_checkout WHERE request_id=${id}`
          )[0] || null,
        guide: assigned || null,
        totalMinor: n?.total,
        discountMinor: n?.discount || 0,
        voucherMinor: n?.voucher || 0,
        items: items.filter((i) =>
          r.plan.days.some((d: any) =>
            d.stops.some((s: any) => s.itemId === i.id),
          ),
        ),
        upsells: items
          .filter(
            (i) =>
              i.bookable &&
              (!weather?.advice?.cautions?.length ||
                !i.outdoor ||
                i.category === "transfer") &&
              ["transfer", "rental", "activity"].includes(i.category) &&
              !r.plan.days.some((d: any) =>
                d.stops.some((s: any) => s.itemId === i.id),
              ),
          )
          .slice(0, 4),
        weather,
        rates: await rates(),
        payOnArrival: (await settings()).payOnArrival,
        paymentsConfigured: !!(
          process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
        ),
        documents:
          await sql`SELECT id,kind,data,created_at FROM platform_documents WHERE request_id=${id}`,
        payments:
          await sql`SELECT id,amount_minor,currency,status,refunded_minor,receipt_url,invoice_url,invoice_hosted_url,invoice_number,created_at FROM hub_payment_sessions WHERE request_id=${id} ORDER BY created_at DESC`,
      });
    }
    if (resource === "trip" && id) {
      if (action === "asset")
        return readAsset(request, id, str(url.searchParams.get("asset"), 120));
      const data = await tripData(request, id);
      if (action === "pdf") {
        const lines = [
          `Saved ${new Date().toISOString()}`,
          `${data.request.guest.name}: ${data.request.plan.adults + data.request.plan.children} guests`,
          ...data.request.plan.days.flatMap((d: any, i: number) => [
            `Day ${i + 1}: ${new Date(new Date(data.request.plan.startDate + "T12:00:00+05:00").valueOf() + i * 86400000).toISOString().slice(0, 10)}`,
            ...d.stops.flatMap((s: any) => {
              const item = data.items.find((i) => i.id === s.itemId);
              return [
                `${s.start} - ${item?.name || s.itemId} (${s.duration} min)`,
                item?.address ||
                  "Address not supplied; use the coordinates on the route page.",
                item ? `${item.lat}, ${item.lng}` : "",
                s.note || "",
              ];
            }),
          ]),
          `Guide: ${data.guide?.name || "Not assigned"} ${data.guide?.phone || "(contact available after payment)"}`,
          `Weather snapshot: ${data.weather?.weather?.fetchedAt || "unavailable"}; forecasts change.`,
          ...(data.weather?.advice?.clothing || []),
          ...(data.weather?.advice?.cautions || []),
          "Emergency: 112. Ambulance: 103. Police: 102. Fire: 101.",
          "Offline copy contains private travel details. Keep it secure and delete it after your trip.",
        ];
        return pdfResponse(
          await documentPdf("Your offline Almaty pack", lines, {
            plan: data.request.plan,
            items: data.items,
          }),
          "almaty-offline-trip.pdf",
        );
      }
      return json(data);
    }
    if (resource === "document" && id) {
      const d = (await sql`SELECT * FROM platform_documents WHERE id=${id}`)[0];
      if (!d) throw new HttpError(404, "Document not found.");
      await booking(request, d.request_id, { guide: false });
      const r = (
        await sql`SELECT guest FROM hub_requests WHERE id=${d.request_id}`
      )[0];
      return pdfResponse(
        await documentPdf("Payment acknowledgment", [
          d.data.number,
          `Customer: ${r.guest.name}`,
          `Booking: ${d.request_id}`,
          `Paid: ${(d.data.amountMinor / 100).toFixed(2)} ${d.data.currency}`,
          `Recorded: ${d.data.paidAt}`,
          `Operator tax ID: ${d.data.operatorTaxId || "Not supplied"}`,
          d.data.providerReceipt || "",
          "This records a payment, not a statutory tax invoice. Contact the operator for a compliant tax invoice.",
        ]),
        "almaty-payment.pdf",
      );
    }
    if (resource === "guide") {
      const a = await ownedGuide();
      const assignments =
        await sql`SELECT a.*,r.status AS booking_status,r.guest,r.paid_minor,r.payment_status,CASE WHEN r.status IN ('confirmed','completed') AND q.status='approved' THEN q.plan ELSE p.data END AS plan FROM guide_assignments a JOIN hub_requests r ON r.id=a.request_id JOIN hub_plans p ON p.id=r.plan_id LEFT JOIN hub_quotes q ON q.id=r.quote_id WHERE a.guide_id=${a.row.id} ORDER BY a.starts_at DESC LIMIT 100`;
      return json({
        guide: a.guide,
        connect: {
          account: !!a.row.stripe_account,
          ready: a.row.stripe_ready,
          configured: process.env.STRIPE_CONNECT_ENABLED === "true",
        },
        assignments: assignments.map((r) => ({
          ...r,
          guest: ["confirmed", "completed"].includes(r.booking_status)
            ? {
                ...r.guest,
                email: contactUnlocked(r) ? r.guest.email : "",
                phone: contactUnlocked(r) ? r.guest.phone : "",
                message: contactUnlocked(r)
                  ? r.guest.message
                  : "Contact details unlock after payment.",
              }
            : undefined,
          plan: ["confirmed", "completed"].includes(r.booking_status)
            ? contactUnlocked(r)
              ? r.plan
              : redactDeep(r.plan)
            : {
                startDate: r.plan.startDate,
                adults: r.plan.adults,
                children: r.plan.children,
                days: r.plan.days.map(() => ({ stops: [] })),
              },
        })),
        availability:
          await sql`SELECT * FROM guide_availability WHERE guide_id=${a.row.id} AND ends_at>now()-interval '30 days' ORDER BY starts_at LIMIT 300`,
        transfers:
          await sql`SELECT t.*,r.reason AS refund_reason FROM guide_transfers t LEFT JOIN platform_refunds r ON r.payment_id=t.payment_id WHERE t.guide_id=${a.row.id} ORDER BY t.created_at DESC LIMIT 100`,
      });
    }
    if (resource === "admin") {
      const staff = await requireStaff(
        id === "guides" ? ["owner", "manager"] : ["owner"],
      );
      if (id === "research")
        return json({
          drafts:
            await sql`SELECT id,data,status,created_at FROM research_drafts ORDER BY created_at DESC LIMIT 100`,
          watches:
            await sql`SELECT w.*,c.data->>'name' AS name FROM research_watches w JOIN hub_catalog c ON c.id=w.item_id ORDER BY w.last_checked NULLS FIRST LIMIT 100`,
          prices: (await catalog(true)).filter(
            (i) =>
              !i.price ||
              i.price.source !== "owner-confirmed" ||
              new Date(i.price.updatedAt).valueOf() <
                Date.now() - 30 * 86400000,
          ),
          sources: await sql`SELECT host,note FROM research_sources`,
          configured: {
            google: !!process.env.GOOGLE_PLACES_API_KEY,
            search: !!process.env.TAVILY_API_KEY,
            ai: !!process.env.TRAVEL_AI_KEY,
          },
        });
      if (id === "guides")
        return json({
          staff,
          guides:
            await sql`SELECT g.*,COALESCE(avg(v.rating) FILTER(WHERE v.status='approved'),0) AS rating,count(DISTINCT a.id) FILTER(WHERE a.status='completed')::int AS tours FROM guides g LEFT JOIN guide_assignments a ON a.guide_id=g.id LEFT JOIN guide_reviews v ON v.assignment_id=a.id GROUP BY g.id ORDER BY tours DESC`,
          assignments:
            await sql`SELECT a.*,r.guest->>'name' AS client FROM guide_assignments a JOIN hub_requests r ON r.id=a.request_id ORDER BY a.starts_at DESC LIMIT 200`,
          calendar:
            await sql`SELECT * FROM guide_availability WHERE ends_at>now()-interval '7 days' ORDER BY starts_at LIMIT 400`,
          requests:
            await sql`SELECT r.id,r.status,r.currency,r.guest->>'name' AS name,p.data->>'startDate' AS date FROM hub_requests r JOIN hub_plans p ON p.id=r.plan_id WHERE r.status NOT IN ('cancelled','completed') ORDER BY r.created_at DESC LIMIT 200`,
          reviews:
            await sql`SELECT v.*,g.data->>'name' AS guide FROM guide_reviews v JOIN guide_assignments a ON a.id=v.assignment_id JOIN guides g ON g.id=a.guide_id ORDER BY v.created_at DESC LIMIT 50`,
          followups:
            await sql`SELECT * FROM guide_followups WHERE status IN ('pending','approved') ORDER BY created_at DESC LIMIT 50`,
        });
      if (id === "commerce")
        return json({
          settings: await commerceSettings(),
          payments:
            await sql`SELECT s.*,r.guest->>'name' AS client,r.plan_id,r.payment_status,r.status AS booking_status FROM hub_payment_sessions s JOIN hub_requests r ON r.id=s.request_id ORDER BY s.created_at DESC LIMIT 150`,
          requests:
            await sql`SELECT id,plan_id,status,payment_status,paid_minor,currency,guest->>'name' AS name FROM hub_requests ORDER BY created_at DESC LIMIT 150`,
          refunds:
            await sql`SELECT * FROM platform_refunds ORDER BY created_at DESC LIMIT 100`,
          transfers:
            await sql`SELECT * FROM guide_transfers ORDER BY created_at DESC LIMIT 100`,
          codes:
            await sql`SELECT * FROM platform_codes ORDER BY created_at DESC LIMIT 100`,
          deals:
            await sql`SELECT * FROM platform_deals ORDER BY starts_at DESC LIMIT 100`,
          jobs: await sql`SELECT * FROM platform_jobs ORDER BY created_at DESC LIMIT 30`,
          usage:
            await sql`SELECT provider,sum(requests)::int AS requests FROM hub_provider_usage WHERE day>current_date-30 GROUP BY provider`,
          configuration: {
            stripe: !!process.env.STRIPE_SECRET_KEY,
            webhook: !!process.env.STRIPE_WEBHOOK_SECRET,
            connect: process.env.STRIPE_CONNECT_ENABLED === "true",
            email: !!process.env.RESEND_API_KEY,
            telegram: !!process.env.TELEGRAM_BOT_TOKEN,
            whatsapp: !!process.env.WHATSAPP_ACCESS_TOKEN,
            ai: !!process.env.TRAVEL_AI_KEY,
          },
        });
    }
    throw new HttpError(404, "Not found.");
  }
  origin(request);
  await limit(
    request,
    `platform:${resource}`,
    resource === "assistant" ? 30 : 60,
  );
  if (resource === "trip" && id && action === "upload")
    return json(await upload(request, id));
  const b = await body(request);
  if (resource === "assistant")
    return json(
      await assistant(
        str(b.question, 1000),
        b.language === "ru" ? "ru" : "en",
        b.useAI === true,
      ),
    );
  if (resource === "booking" && id) {
    const a = await booking(request, id, { guide: false });
    if (b.action === "payment-link") {
      if (!["owner", "manager"].includes(a.role))
        throw new HttpError(403, "Travel desk access required.");
      return json(await sendPaymentLink(id, a.actor));
    }
    if (b.action === "accept")
      return json(
        await acceptCheckout(
          id,
          a.role === "client" ? a.user?.id || "" : a.request.client_id || "",
          str(b.termsVersion, 100),
          str(b.promo || "", 64).toUpperCase(),
          str(b.voucher || "", 64).toUpperCase(),
        ),
      );
    if (b.action === "pay")
      return json(
        await pay(id, z.enum(["full", "deposit", "arrival"]).parse(b.mode)),
      );
    if (b.action === "approve") {
      const quote = (
        await sql`UPDATE hub_quotes SET status='approved',approved_at=now() WHERE id=${str(b.quoteId, 120)} AND request_id=${id} AND id=${a.request.quote_id} AND status='pending' AND expires_at>now() AND plan_version=${a.request.plan_version} RETURNING id`
      )[0];
      if (!quote)
        throw new HttpError(
          409,
          "The quote changed, expired or was already approved. Reload.",
        );
      await audit(a.actor, "quote.approve", id);
      return json({ ok: true });
    }
    if (b.action === "referral")
      return json(await referral(request, id, str(b.code, 64)));
    if (b.action === "upsell") {
      const item = (await catalog()).find(
        (i) => i.id === b.itemId && i.bookable,
      );
      if (!item) throw new HttpError(400, "Service unavailable.");
      await postMessage(request, id, {
        body: `Please quote adding ${item.name} (${item.id}) to my package.`,
        kind: "text",
      });
      return json({
        ok: true,
        message:
          "The manager will confirm availability and send an updated quote. Your accepted price has not changed.",
      });
    }
  }
  if (resource === "trip" && id) {
    if (b.action === "message") return json(await postMessage(request, id, b));
    if (b.action === "note") {
      const a = await booking(request, id);
      if (a.role === "client")
        throw new HttpError(
          403,
          "Internal notes are for assigned guides and staff.",
        );
      await sql`INSERT INTO hub_messages(request_id,actor,visibility,body) VALUES(${id},${a.actor},'internal',${str(b.body, 4000)})`;
      return json({ ok: true });
    }
    if (b.action === "translate") {
      const translationAccess = await booking(request, id);
      if (b.consent !== true)
        throw new HttpError(
          400,
          "Allow this message to be sent to the translation provider.",
        );
      const m = (
        await sql`SELECT body FROM hub_messages WHERE request_id=${id} AND id=${z.number().int().parse(b.messageId)} AND visibility='client'`
      )[0];
      if (!m) throw new HttpError(404, "Message unavailable.");
      const text = await translate(
        contactUnlocked(translationAccess.request)
          ? m.body
          : scrubContacts(m.body),
        b.language === "ru" ? "ru" : "en",
      );
      return json({
        text: contactUnlocked(translationAccess.request)
          ? text
          : scrubContacts(text),
      });
    }
    if (b.action === "check-in" || b.action === "emergency")
      return json(
        await safety(
          request,
          id,
          b.action,
          z
            .object({
              lat: z.number().min(-90).max(90).optional(),
              lng: z.number().min(-180).max(180).optional(),
              message: z.string().max(1000).optional(),
            })
            .parse(b),
        ),
      );
    if (b.action === "review") {
      const a = await booking(request, id, { staff: false, guide: false });
      if (a.request.status !== "completed")
        throw new HttpError(409, "Reviews open after your trip is completed.");
      const assignment = (
        await sql`SELECT id FROM guide_assignments WHERE request_id=${id} AND status='completed' ORDER BY created_at DESC LIMIT 1`
      )[0];
      if (!assignment)
        throw new HttpError(409, "No completed guide assignment.");
      await sql`INSERT INTO guide_reviews(id,assignment_id,rating,body) VALUES(${randomUUID()},${assignment.id},${z.number().int().min(1).max(5).parse(b.rating)},${str(b.body, 2000)}) ON CONFLICT(assignment_id) DO UPDATE SET rating=EXCLUDED.rating,body=EXCLUDED.body,status='pending'`;
      return json({ ok: true });
    }
    if (b.action === "followup")
      return json(await createFollowup(request, id, b.plan));
    if (b.action === "accept-followup")
      return json(
        await acceptFollowup(
          request,
          id,
          str(b.followupId, 120),
          str(b.offerVersion, 120),
          b.acceptTerms === true,
          z.enum(["full", "deposit", "arrival"]).parse(b.mode || "full"),
          b.payNow === true,
        ),
      );
    if (b.action === "pair") {
      const { pair } = await import("./bots");
      return json(
        await pair(
          request,
          id,
          z.enum(["telegram", "whatsapp"]).parse(b.channel),
          b.consent === true,
        ),
      );
    }
  }
  if (resource === "waitlist") {
    if (b.action === "confirm" || b.action === "unsubscribe")
      return json(
        await waitlistConfirm(
          str(b.id, 120),
          str(b.key, 200),
          b.action === "confirm",
        ),
      );
    return json(
      await waitlistJoin(
        z.email().parse(b.email),
        str(b.itemId, 120),
        z.number().int().min(1).max(80).parse(b.guests),
        b.consent === true,
      ),
    );
  }
  if (resource === "guide") {
    if (b.action === "claim")
      return json(await claimGuide(str(b.key, 200), b.acceptTerms === true));
    if (b.action === "tour")
      return json(await guideAction(str(b.id, 120), str(b.state, 30)));
    if (b.action === "calendar") {
      const a = await ownedGuide();
      return json(
        await saveAvailability(
          a.row.id,
          z.iso.datetime().parse(b.start),
          z.iso.datetime().parse(b.end),
          b.blocked === true,
        ),
      );
    }
    if (b.action === "connect") return json(await onboarding());
    if (b.action === "connect-status") return json(await connectStatus());
  }
  if (resource === "admin") {
    const staff = await requireStaff(
      id === "guides" ? ["owner", "manager"] : ["owner"],
    );
    if (id === "research") {
      if (b.action === "search")
        return json(
          await research(
            str(b.query, 500),
            staff.id,
            b.bulk === true,
            20,
            str(b.category || "activity", 40),
          ),
        );
      if (b.action === "review-price") {
        const watch = (
            await sql`SELECT * FROM research_watches WHERE item_id=${str(b.itemId, 120)} AND status='review'`
          )[0],
          item = (await catalog(true)).find((i) => i.id === b.itemId);
        if (!watch?.snapshot?.price || !item)
          throw new HttpError(409, "No current structured price candidate.");
        const { priceSchema } = await import("@/lib/hub/types");
        const price = priceSchema.parse({
          ...watch.snapshot.price,
          source: b.confirmed ? "owner-confirmed" : "estimated",
          updatedAt: new Date().toISOString(),
        });
        await saveCatalog(
          {
            ...item,
            price,
            researchEvidence: {
              ...item.researchEvidence,
              price: {
                value: price,
                evidence: {
                  source: "Official structured offer",
                  url: watch.url,
                  checkedAt: watch.last_checked,
                  confidence: watch.snapshot.confidence,
                  persistence: "licensed",
                },
              },
            },
          },
          staff,
        );
        await sql`UPDATE research_watches SET status='approved' WHERE item_id=${item.id}`;
        await audit(staff.id, "research.price.approve", item.id, {
          confirmed: b.confirmed === true,
        });
        return json({ ok: true });
      }
      if (b.action === "prices")
        return json(
          await findPrices(
            str(b.url, 1200),
            b.draftId ? str(b.draftId, 120) : undefined,
            b.itemId ? str(b.itemId, 120) : undefined,
          ),
        );
      if (b.action === "publish")
        return json(
          await publishResearch(
            str(b.id, 120),
            b.item,
            staff,
            b.confirmPrice === true,
          ),
        );
      if (b.action === "hide") {
        await sql`UPDATE research_drafts SET status='hidden' WHERE id=${str(b.id, 120)}`;
        return json({ ok: true });
      }
      if (b.action === "source") {
        const host = z
          .string()
          .regex(/^[a-z0-9][a-z0-9.-]+\.[a-z]{2,}$/)
          .max(200)
          .parse(b.host);
        await sql`INSERT INTO research_sources(host,note,actor) VALUES(${host},${str(b.note, 1000)},${staff.id}) ON CONFLICT(host) DO UPDATE SET note=EXCLUDED.note,actor=EXCLUDED.actor`;
        await audit(staff.id, "research.source", host);
        return json({ ok: true });
      }
      if (b.action === "translate") {
        const d = (
          await sql`SELECT data FROM research_drafts WHERE id=${str(b.id, 120)} AND status='pending'`
        )[0];
        if (!d) throw new HttpError(404, "Draft not found.");
        const data = d.data;
        data.item.descriptionRu = await translate(
          data.item.description || "",
          "ru",
        );
        data.fields.descriptionRu = {
          value: data.item.descriptionRu,
          evidence: {
            source: "AI translation; review required",
            url: data.item.sourceUrl,
            checkedAt: new Date().toISOString(),
            confidence: 0.6,
            persistence: "licensed",
            licence: data.fields.description?.evidence?.licence,
          },
        };
        await sql`UPDATE research_drafts SET data=${JSON.stringify(data)}::jsonb WHERE id=${b.id}`;
        return json(data);
      }
      if (b.action === "google") {
        const { googleLive } = await import("./research");
        return json(await googleLive(str(b.query, 300)));
      }
    }
    if (id === "guides") {
      if (b.action === "save") {
        if (staff.role !== "owner")
          throw new HttpError(
            403,
            "Owner access required to edit guide terms and rates.",
          );
        return json(await saveGuide(b.guide, staff.id));
      }
      if (b.action === "invite") {
        if (staff.role !== "owner")
          throw new HttpError(403, "Owner access required.");
        return json(await inviteGuide(str(b.id, 120), staff.id));
      }
      if (b.action === "candidates")
        return json({ guides: await candidates(str(b.requestId, 120)) });
      if (b.action === "offer")
        return json(
          await offerGuide(
            str(b.requestId, 120),
            b.guideId ? str(b.guideId, 120) : undefined,
          ),
        );
      if (b.action === "reassign")
        return json(await reassignGuide(str(b.id, 120), staff.id));
      if (b.action === "complete")
        return json(await approveCompletion(str(b.id, 120), staff.id));
      if (b.action === "calendar")
        return json(
          await saveAvailability(
            str(b.id, 120),
            z.iso.datetime().parse(b.start),
            z.iso.datetime().parse(b.end),
            b.blocked === true,
          ),
        );
      if (b.action === "review") {
        await sql`UPDATE guide_reviews SET status=${b.status === "approved" ? "approved" : "hidden"} WHERE id=${str(b.id, 120)}`;
        await audit(staff.id, "guide.review", str(b.id, 120));
        return json({ ok: true });
      }
      if (b.action === "followup") {
        if (b.approved)
          return json(await approveFollowup(str(b.id, 120), b.offer, staff.id));
        await sql`UPDATE guide_followups SET status='hidden' WHERE id=${str(b.id, 120)} AND status IN ('pending','approved')`;
        return json({ ok: true });
      }
    }
    if (id === "commerce") {
      if (b.action === "settings") {
        const settings = commerceSchema.parse(b.settings);
        await sql`UPDATE platform_settings SET data=${JSON.stringify(settings)}::jsonb,updated_at=now() WHERE id=true`;
        await audit(staff.id, "commerce.settings", "platform");
        return json({ ok: true });
      }
      if (b.action === "link")
        return json(await sendPaymentLink(str(b.requestId, 120), staff.id));
      if (b.action === "cash" || b.action === "cash-refund") {
        const requestId = str(b.requestId, 120),
          cashId = z.uuid().parse(b.cashId),
          amount = z
            .number()
            .int()
            .positive()
            .max(100000000)
            .parse(b.amountMinor);
        if (b.action === "cash-refund")
          await sql`SELECT platform_record_cash_refund(${cashId},${requestId},${amount},${staff.id})`;
        else
          await sql`SELECT platform_record_cash(${cashId},${requestId},${amount},${staff.id})`;
        await audit(
          staff.id,
          b.action === "cash"
            ? "payment.cash.record"
            : "payment.cash.refund.record",
          requestId,
          {
            cashId,
            amount,
          },
        );
        return json({ ok: true });
      }
      if (b.action === "refund")
        return json(
          await cancelRefund(
            str(b.requestId, 120),
            staff.id,
            str(b.reason, 1000),
          ),
        );
      if (b.action === "payout")
        return json(await releaseEarnings(str(b.assignmentId, 120), staff.id));
      if (b.action === "code") {
        const c = codeSchema.parse(b.code);
        if (
          (await sql`SELECT code FROM platform_codes WHERE code=${c.code}`)[0]
        )
          throw new HttpError(
            409,
            "Codes are immutable after creation. Create a new code.",
          );
        await sql`INSERT INTO platform_codes(code,data,balance_minor) VALUES(${c.code},${JSON.stringify(c)}::jsonb,${["voucher", "loyalty"].includes(c.kind) ? c.amountMinor : 0})`;
        await audit(staff.id, "commerce.code", c.code);
        return json({ ok: true });
      }
      if (b.action === "deal") {
        const d = z
          .object({
            itemId: z.string().max(120),
            percent: z.number().min(0).max(80),
            startsAt: z.iso.datetime(),
            endsAt: z.iso.datetime(),
            note: z.string().max(500),
          })
          .parse(b);
        if (new Date(d.endsAt) <= new Date(d.startsAt))
          throw new HttpError(400, "End must follow start.");
        await sql`INSERT INTO platform_deals(id,item_id,percent,starts_at,ends_at,note) VALUES(${randomUUID()},${d.itemId},${d.percent},${d.startsAt},${d.endsAt},${d.note})`;
        return json({ ok: true });
      }
      if (b.action === "tick") {
        const { platformTick } = await import("./jobs");
        return json(await platformTick(true));
      }
    }
  }
  throw new HttpError(400, "Unknown action.");
}
