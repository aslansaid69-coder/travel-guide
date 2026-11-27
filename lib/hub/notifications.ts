import { beginRun, finishRun } from "@/lib/updates/store";
import { drainAlerts } from "@/lib/updates/alerts";
import { unsubscribeToken } from "./newsletter";
import { database } from "@/lib/db";
import { siteUrl } from "@/lib/site";
import { notify, settings, catalog, privateLink } from "./store";
import { getWeather } from "@/lib/weather/read";
import { conflicts } from "./core";
export async function drainNotifications() {
  const sql = database();
  await sql`UPDATE hub_notifications SET status='pending',last_error='Retrying interrupted delivery.' WHERE status='sending' AND due_at<now()-interval '5 minutes'`;
  const rows =
    await sql`SELECT id,channel,recipient,subject,body,attempts FROM hub_notifications WHERE status='pending' AND due_at<=now() AND attempts<5 ORDER BY due_at LIMIT 6`;
  const totals = { sent: 0, pending: 0, failed: 0 };
  let cursor = 0;
  const worker = async () => {
    while (cursor < rows.length) {
      const n = rows[cursor++];
      const configured =
        n.channel === "email"
          ? !!(
              process.env.RESEND_API_KEY &&
              (process.env.CONTACT_FROM || process.env.ALERT_FROM)
            )
          : n.channel === "telegram"
            ? !!process.env.TELEGRAM_BOT_TOKEN
            : n.channel === "whatsapp"
              ? !!(
                  process.env.WHATSAPP_ACCESS_TOKEN &&
                  process.env.WHATSAPP_PHONE_NUMBER_ID
                )
              : !!(
                  process.env.TWILIO_ACCOUNT_SID &&
                  process.env.TWILIO_AUTH_TOKEN &&
                  process.env.TWILIO_FROM
                );
      if (!configured) {
        totals.pending++;
        await sql`UPDATE hub_notifications SET last_error='Provider configuration required.' WHERE id=${n.id}`;
        continue;
      }
      const claimed =
        await sql`UPDATE hub_notifications SET status='sending',attempts=attempts+1,due_at=now() WHERE id=${n.id} AND status='pending' RETURNING id`;
      if (!claimed.length) continue;
      try {
        let r: Response;
        if (n.channel === "email")
          r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
              "Idempotency-Key": `hub-${n.id}`,
            },
            body: JSON.stringify({
              from: process.env.CONTACT_FROM || process.env.ALERT_FROM,
              to: [n.recipient],
              subject: n.subject,
              text: n.body,
            }),
            signal: AbortSignal.timeout(8000),
          });
        else if (n.channel === "telegram")
          r = await fetch(
            `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: n.recipient,
                text: `${n.subject}\n${n.body}`,
              }),
              signal: AbortSignal.timeout(8000),
            },
          );
        else if (n.channel === "whatsapp") {
          const recent = (
            await sql`SELECT address FROM whatsapp_windows WHERE address=${n.recipient} AND last_inbound>now()-interval '24 hours'`
          )[0];
          if (!recent && !process.env.WHATSAPP_TEMPLATE_NAME)
            throw new Error(
              "Approved WhatsApp template required outside the service window.",
            );
          r = await fetch(
            `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION || "v25.0"}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                to: n.recipient,
                ...(recent
                  ? { type: "text", text: { body: `${n.subject}\n${n.body}` } }
                  : {
                      type: "template",
                      template: {
                        name: process.env.WHATSAPP_TEMPLATE_NAME,
                        language: {
                          code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en",
                        },
                        components: [
                          {
                            type: "body",
                            parameters: [
                              { type: "text", text: n.subject },
                              { type: "text", text: n.body },
                            ],
                          },
                        ],
                      },
                    }),
              }),
              signal: AbortSignal.timeout(8000),
            },
          );
        } else
          r = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
            {
              method: "POST",
              headers: {
                Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                To: n.recipient,
                From: process.env.TWILIO_FROM!,
                Body: `${n.subject}\n${n.body}`,
              }),
              signal: AbortSignal.timeout(8000),
            },
          );
        if (!r.ok) throw new Error("Provider declined delivery.");
        await sql`UPDATE hub_notifications SET status='sent',sent_at=now(),last_error=NULL WHERE id=${n.id}`;
        totals.sent++;
      } catch {
        await sql`UPDATE hub_notifications SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,last_error='Delivery failed; check provider configuration and logs.',due_at=now()+interval '30 minutes' WHERE id=${n.id}`;
        totals.failed++;
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return totals;
}
async function notifyPlan(
  id: string,
  email: string,
  subject: string,
  text: string,
  planId: string,
) {
  if ((await database()`SELECT id FROM hub_notifications WHERE id=${id}`)[0])
    return;
  await notify(
    id,
    email,
    subject,
    `${text}\n\nYour private plan link: ${await privateLink(planId)}`,
  );
}
export async function automationTick() {
  const sql = database();
  const key = `hub:${Math.floor(Date.now() / 900000)}`;
  const claimed =
    await sql`INSERT INTO hub_schedule_runs(key,status) VALUES(${key},'running') ON CONFLICT(key) DO UPDATE SET status='running',created_at=now() WHERE hub_schedule_runs.status='failed' OR (hub_schedule_runs.status='running' AND hub_schedule_runs.created_at<now()-interval '5 minutes') RETURNING key`;
  if (!claimed.length) return { skipped: true };
  await beginRun(key, "automation", "scheduler");
  try {
    const conf = await settings();
    const weather = await getWeather().catch(() => null);
    const rows =
      await sql`SELECT r.id,r.plan_id,r.guest,r.status,r.assigned_to,r.created_at,r.contacted_at,p.data FROM hub_requests r JOIN hub_plans p ON p.id=r.plan_id WHERE r.status NOT IN ('cancelled') ORDER BY r.created_at DESC LIMIT 100`;
    const items = await catalog();
    for (const r of rows) {
      const link = `${siteUrl}/trip/${r.plan_id}`;
      if (
        r.status === "new" &&
        !r.contacted_at &&
        new Date(r.created_at).valueOf() < Date.now() - 1800000 &&
        process.env.ALERT_TO
      )
        await notify(
          `sla:${r.id}`,
          process.env.ALERT_TO,
          "Request awaiting a reply",
          `Request ${r.id} has waited more than 30 minutes.\n${siteUrl}/admin/hub`,
        );
      const start = new Date(r.data.startDate + "T09:00:00+05:00").valueOf();
      if (
        r.status === "confirmed" &&
        start > Date.now() &&
        start - Date.now() <= 86400000
      ) {
        await notifyPlan(
          `reminder:${r.id}`,
          r.guest.email,
          "Your Almaty trip is tomorrow",
          `Your trip starts ${r.data.startDate}. View your plan and contact the team.`,
          r.plan_id,
        );
        if (
          r.guest.messageConsent &&
          r.guest.phone &&
          /^\+\d{8,15}$/.test(r.guest.phone)
        )
          await notify(
            `sms:${r.id}`,
            r.guest.phone,
            "Almaty trip reminder",
            link,
            undefined,
            "sms",
          );
      }
      if (r.status === "confirmed" && weather?.weather && !weather.stale) {
        const risks = conflicts(r.data, items, weather.weather).filter(
          (c) => c.kind === "weather",
        );
        if (risks.length) {
          if (process.env.ALERT_TO)
            await notify(
              `weather-owner:${r.id}:${weather.weather.daily[0].date}`,
              process.env.ALERT_TO,
              "Weather risk for a booking",
              `Review ${r.id}: ${risks.length} outdoor stop(s) at risk.\n${siteUrl}/admin/hub`,
            );
          await notifyPlan(
            `weather-client:${r.id}:${weather.weather.daily[0].date}`,
            r.guest.email,
            "Let’s check the weather for your trip",
            `Some outdoor stops may be affected by weather. Ask our team for a free reschedule or an indoor alternative using your saved private plan link. Your existing booking has not been changed.`,
            r.plan_id,
          );
        }
      }
      if (r.status === "completed") {
        await notifyPlan(
          `review:${r.id}`,
          r.guest.email,
          "How was your Almaty trip?",
          `Thank you for exploring Almaty with us. Leave a review using your private trip link or your account.`,
          r.plan_id,
        );
        if (r.guest.marketingConsent && conf.returnDiscount)
          await notify(
            `return:${r.id}`,
            r.guest.email,
            "A little reason to return to Almaty",
            `Your return-trip offer: ${conf.returnDiscount}\nContact our team before booking.\n${siteUrl}/privacy`,
          );
      }
    }
    const abandoned =
      await sql`SELECT p.id,p.email FROM hub_plans p WHERE p.reminder_consent=true AND p.email IS NOT NULL AND p.last_seen<now()-interval '24 hours' AND p.last_seen>now()-interval '7 days' AND NOT EXISTS(SELECT 1 FROM hub_requests r WHERE r.plan_id=p.id) LIMIT 100`;
    for (const p of abandoned)
      await notifyPlan(
        `recovery:${p.id}`,
        p.email,
        "Your Almaty plan is waiting",
        `Your plan is saved.\n${weather?.advice?.clothing[0] || "Check the latest city and mountain forecast before heading out."}\nThis one-time reminder was requested when you saved your plan.`,
        p.id,
      );
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Almaty",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const localHour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Almaty",
        hour: "2-digit",
        hourCycle: "h23",
      }).format(new Date()),
    );
    if (localHour >= conf.dailyHour) {
      const subscribers =
        await sql`SELECT id,email,language FROM hub_subscribers WHERE confirmed=true AND active=true LIMIT 500`;
      for (const s of subscribers)
        await notify(
          `digest:${date}:${s.id}`,
          s.email,
          "Today in Almaty",
          `${weather?.weather ? `Current city temperature: ${Math.round(weather.weather.current.temperature)}°C.\n` : ""}${weather?.advice?.clothing[0] || "Check today’s forecast before travelling."}\nExplore local events and plan your day: ${siteUrl}\nManage email preferences: ${siteUrl}/privacy?subscriber=${s.id}&token=${unsubscribeToken(s.id)}`,
        );
    }
    await sql`DELETE FROM hub_access_links WHERE expires_at<now()`;
    await sql`UPDATE hub_notifications SET body='Delivery record retained; message content removed.',recipient='' WHERE status='sent' AND sent_at<now()-interval '7 days' AND recipient<>''`;
    await sql`DELETE FROM hub_rate_limits WHERE expires_at<now()`;
    await sql`DELETE FROM hub_analytics WHERE created_at<now()-interval '180 days'`;
    await sql`UPDATE hub_plans SET email=NULL,reminder_consent=false WHERE last_seen<now()-interval '90 days' AND NOT EXISTS(SELECT 1 FROM hub_requests r WHERE r.plan_id=hub_plans.id)`;
    const delivery = await drainNotifications();
    await sql`UPDATE hub_schedule_runs SET status='success' WHERE key=${key}`;
    await finishRun(
      key,
      "automation",
      delivery.failed ? "failed" : "success",
      { delivery },
      delivery.failed > 0,
    );
    await drainAlerts().catch(() => {});
    return { ok: delivery.failed === 0, ...delivery };
  } catch {
    await sql`UPDATE hub_schedule_runs SET status='failed',details='{"reason":"Automation worker failed; queued notifications retained."}'::jsonb WHERE key=${key}`;
    await finishRun(
      key,
      "automation",
      "failed",
      {
        reason:
          "Automation worker failed; last-good content and queued messages retained.",
      },
      true,
    );
    await drainAlerts().catch(() => {});
    throw new Error("Automation worker failed.");
  }
}
