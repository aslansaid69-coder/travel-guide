import { randomUUID } from "node:crypto";
import { database } from "@/lib/db";
import { notify, availableSlots } from "@/lib/hub/store";
import { getWeather } from "@/lib/weather/read";
import { drainNotifications } from "@/lib/hub/notifications";
import { beginRun, finishRun } from "@/lib/updates/store";
import { drainAlerts } from "@/lib/updates/alerts";
import { unsubscribeToken } from "@/lib/hub/newsletter";
import { siteUrl } from "@/lib/site";
import { offerGuide } from "./guides";
import { releaseEarnings } from "./payouts";
import { commerceSettings } from "./store";
import { findPrices } from "./research";
export const localDate = (date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export async function platformTick(force = false) {
  const sql = database(),
    key = `platform:${Math.floor(Date.now() / 900000)}${force ? ":manual:" + randomUUID() : ""}`;
  const claimed =
    await sql`INSERT INTO platform_jobs(key) VALUES(${key}) ON CONFLICT(key) DO UPDATE SET status='running',created_at=now() WHERE platform_jobs.status='failed' OR platform_jobs.status='running' AND platform_jobs.created_at<now()-interval '5 minutes' RETURNING key`;
  if (!claimed.length) return { skipped: true };
  await beginRun(key, "platform", "scheduler");
  const details: { step: string; status: string; count?: number }[] = [];
  const step = async (name: string, fn: () => Promise<number | void>) => {
    try {
      const count = await fn();
      details.push({
        step: name,
        status: "success",
        ...(typeof count === "number" ? { count } : {}),
      });
    } catch {
      details.push({ step: name, status: "failed" });
    }
  };
  await step("guide-offer-timeouts", async () => {
    const expired =
      await sql`UPDATE guide_assignments SET status='expired',updated_at=now() WHERE status='offered' AND expires_at<=now() RETURNING request_id`;
    const requests =
      await sql`SELECT DISTINCT a.request_id FROM guide_assignments a JOIN hub_requests r ON r.id=a.request_id WHERE a.status IN ('declined','expired','reassigned','schedule-changed') AND a.starts_at>now() AND r.status NOT IN ('cancelled','completed') AND NOT EXISTS(SELECT 1 FROM guide_assignments b WHERE b.request_id=a.request_id AND b.status IN ('offered','accepted','started','completion_requested')) LIMIT 3`;
    for (const r of requests)
      await offerGuide(r.request_id).catch(async () => {
        if (process.env.ALERT_TO)
          await notify(
            `guide-unassigned:${r.request_id}:${localDate()}`,
            process.env.ALERT_TO,
            "Guide needed for a booking",
            `No available guide can be offered for ${r.request_id}.\n${siteUrl}/admin/guides`,
          );
      });
    return expired.length;
  });
  await step("guide-earnings", async () => {
    if (process.env.STRIPE_CONNECT_ENABLED !== "true") return 0;
    const a =
      await sql`SELECT a.id FROM guide_assignments a JOIN hub_requests r ON r.id=a.request_id WHERE a.status='completed' AND a.completion_approved=true AND r.status='completed' AND r.payment_status='paid' AND NOT EXISTS(SELECT 1 FROM guide_transfers t WHERE t.assignment_id=a.id AND t.status IN ('paid','needs-review')) ORDER BY a.ends_at LIMIT 2`;
    for (const r of a) await releaseEarnings(r.id, "scheduler");
    return a.length;
  });
  await step("loyalty", async () => {
    const c = await commerceSettings(),
      rows =
        await sql`SELECT r.id,r.currency,p.client_id,r.guest,r.paid_minor FROM hub_requests r JOIN hub_plans p ON p.id=r.plan_id JOIN hub_quotes q ON q.id=r.quote_id LEFT JOIN platform_checkout pc ON pc.request_id=r.id WHERE r.status='completed' AND r.payment_status='paid' AND p.client_id IS NOT NULL AND r.paid_minor>=q.amount_minor-COALESCE(pc.discount_minor,0)-COALESCE(pc.voucher_minor,0) AND r.paid_minor>0 AND NOT EXISTS(SELECT 1 FROM platform_refunds f WHERE f.request_id=r.id AND f.status<>'failed') ORDER BY r.created_at DESC LIMIT 30`;
    for (const r of rows) {
      const expires = new Date(Date.now() + 365 * 86400000).toISOString(),
        code = `RETURN-${r.id
          .replace(/[^a-z0-9]/gi, "")
          .slice(0, 24)
          .toUpperCase()}`,
        data = {
          code,
          kind: "promo",
          percent: c.returningDiscountPercent,
          amountMinor: 0,
          currency: r.currency,
          maxUses: 1,
          minimumMinor: 0,
          customerId: r.client_id,
          startsAt: new Date().toISOString(),
          expiresAt: expires,
          active: true,
        };
      const inserted =
        await sql`INSERT INTO platform_codes(code,data) VALUES(${code},${JSON.stringify(data)}::jsonb) ON CONFLICT DO NOTHING RETURNING code`;
      if (inserted.length && r.guest.marketingConsent)
        await notify(
          `loyalty:${r.id}`,
          r.guest.email,
          "Your next Almaty adventure",
          `Your verified account has a ${c.returningDiscountPercent}% returning-traveller code: ${code}. Valid for one booking until ${expires.slice(0, 10)}.\n${siteUrl}/account`,
        );
      await sql`SELECT platform_reward_referral(${r.id},${c.referralRewardMinor})`;
    }
    return rows.length;
  });
  await step("waitlist", async () => {
    const slots = await availableSlots(),
      rows =
        await sql`SELECT w.*,d.id AS deal_id,d.percent FROM waitlist w LEFT JOIN platform_deals d ON d.item_id=w.item_id AND d.active=true AND d.starts_at<=now() AND d.ends_at>now() WHERE w.active=true AND w.confirmed=true LIMIT 100`;
    let count = 0;
    for (const w of rows) {
      const slot = slots.find(
          (s) =>
            s.item_id === w.item_id &&
            !s.blackout &&
            Number(s.remaining) >= w.guests,
        ),
        notice = w.deal_id
          ? `deal:${w.deal_id}`
          : slot
            ? `slot:${slot.id}`
            : null;
      if (!notice || w.last_notice === notice) continue;
      await notify(
        `waitlist:${w.id}:${notice}`,
        w.email,
        "An Almaty travel opportunity",
        `${w.deal_id ? `An owner-published ${w.percent}% deal is available.` : "A service slot currently has space."} Availability is not reserved. Ask the team to confirm the final price.\n${siteUrl}/deals\n${siteUrl}/deals#unsubscribe=${w.id}:${unsubscribeToken("waitlist:" + w.id)}`,
      );
      await sql`UPDATE waitlist SET last_notice=${notice} WHERE id=${w.id}`;
      count++;
    }
    return count;
  });
  await step("daily-digests", async () => {
    const c = await commerceSettings(),
      date = localDate(),
      hour = Number(
        new Intl.DateTimeFormat("en-GB", {
          timeZone: "Asia/Almaty",
          hour: "2-digit",
          hourCycle: "h23",
        }).format(new Date()),
      );
    if (hour < 5) return 0;
    const weather = await getWeather().catch(() => null);
    const counts = (
        await sql`SELECT count(*) FILTER(WHERE created_at>now()-interval '24 hours')::int AS new_requests,count(*) FILTER(WHERE status IN ('confirmed','quote-sent') AND payment_status NOT IN ('paid','cash-paid','voucher-paid'))::int AS unpaid FROM hub_requests`
      )[0],
      tomorrow = localDate(new Date(Date.now() + 86400000));
    const tours = (
        await sql`SELECT count(*)::int AS total FROM hub_requests r JOIN hub_plans p ON p.id=r.plan_id WHERE r.status='confirmed' AND p.data->>'startDate'=${tomorrow}`
      )[0].total,
      cameras = (
        await sql`SELECT count(*)::int AS total FROM cameras WHERE status<>'online'`
      )[0].total,
      guideIssues = (
        await sql`SELECT count(DISTINCT a.request_id)::int AS total FROM guide_assignments a JOIN hub_requests r ON r.id=a.request_id WHERE a.status IN ('expired','declined','reassigned','schedule-changed') AND r.status NOT IN ('cancelled','completed') AND NOT EXISTS(SELECT 1 FROM guide_assignments b WHERE b.request_id=a.request_id AND b.status IN ('offered','accepted','started','completion_requested'))`
      )[0].total;
    if (c.ownerDigest && process.env.ALERT_TO) {
      const body = `New requests (24 h): ${counts.new_requests}\nUnpaid/part-paid packages: ${counts.unpaid}\nTomorrow’s tours: ${tours}\nUnassigned guide requests: ${guideIssues}\nCameras requiring attention: ${cameras}\nWeather: ${weather?.advice?.cautions.join(" ") || "Check the latest forecast and timestamp."}\n${siteUrl}/admin/hub`;
      await notify(
        `owner-digest:${date}`,
        process.env.ALERT_TO,
        "Your Almaty daily operations digest",
        body,
      );
      if (process.env.TELEGRAM_CHAT_ID)
        await notify(
          `owner-digest-tg:${date}`,
          process.env.TELEGRAM_CHAT_ID,
          "Almaty daily digest",
          body,
          undefined,
          "telegram",
        );
    }
    const links =
      await sql`SELECT DISTINCT b.* FROM bot_links b JOIN hub_requests r ON r.plan_id=b.plan_id WHERE b.active=true AND b.consent=true AND r.status='confirmed' LIMIT 100`;
    for (const b of links)
      await notify(
        `bot-daily:${date}:${b.id}`,
        b.address,
        "Today in Almaty",
        weather?.advice?.clothing.join(" ") ||
          "Check today’s forecast before travel.",
        undefined,
        b.channel,
      );
    return links.length;
  });
  await step("daily-price-watch", async () => {
    const watches =
      await sql`SELECT * FROM research_watches WHERE last_checked IS NULL OR last_checked<now()-interval '24 hours' ORDER BY last_checked NULLS FIRST LIMIT 1`;
    for (const w of watches)
      try {
        const result = await findPrices(w.url, undefined, w.item_id);
        if (!result.offers.length)
          await sql`UPDATE research_watches SET last_checked=now(),status='review',last_error='No valid structured offer found; last-good candidate retained.' WHERE item_id=${w.item_id}`;
        if (process.env.ALERT_TO)
          await notify(
            `price-review:${w.item_id}:${localDate()}`,
            process.env.ALERT_TO,
            "A published price needs review",
            `An official source was checked for ${w.item_id}. Review the candidate; published owner prices remain unchanged.\n${siteUrl}/admin/research`,
          );
      } catch {
        await sql`UPDATE research_watches SET last_error='Source failed; last-good candidate retained.',last_checked=now() WHERE item_id=${w.item_id}`;
        throw new Error("Price watch failed.");
      }
    return watches.length;
  });
  await step("retention", async () => {
    await sql`DELETE FROM research_cache WHERE expires_at<now()`;
    await sql`DELETE FROM bot_pairings WHERE expires_at<now()-interval '1 day'`;
    await sql`DELETE FROM bot_updates WHERE created_at<now()-interval '30 days'`;
    await sql`DELETE FROM private_assets a USING hub_requests r WHERE a.request_id=r.id AND r.status IN ('completed','cancelled') AND r.updated_at<now()-interval '90 days'`;
    await sql`UPDATE platform_redemptions SET status='released' WHERE status='held' AND expires_at<now()`;
    return 0;
  });
  const failed = details.some((d) => d.status === "failed");
  await sql`UPDATE platform_jobs SET status=${failed ? "failed" : "success"},details=${JSON.stringify(details)}::jsonb,finished_at=now() WHERE key=${key}`;
  await finishRun(
    key,
    "platform",
    failed ? "failed" : "success",
    { steps: details },
    failed,
  );
  await drainAlerts().catch(() => {});
  const delivery = await drainNotifications();
  return { ok: !failed, steps: details, delivery };
}
