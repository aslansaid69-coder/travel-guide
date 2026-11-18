import { randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import { database } from "@/lib/db";
import { HttpError, token, hash } from "@/lib/hub/security";
import { notify, privateLink } from "@/lib/hub/store";
import { getWeather } from "@/lib/weather/read";
import {
  booking,
  scrubContacts,
  contactUnlocked,
  notifyBooking,
} from "./store";
export function verifyHmac(raw: string, signature: string, secret: string) {
  if (!secret) return false;
  const a = Buffer.from(
      "sha256=" + createHmac("sha256", secret).update(raw).digest("hex"),
    ),
    b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function sameSecret(actual: string, expected: string) {
  const a = Buffer.from(actual),
    b = Buffer.from(expected);
  return !!expected && a.length === b.length && timingSafeEqual(a, b);
}
export async function pair(
  request: Request,
  id: string,
  channel: "telegram" | "whatsapp",
  consent: boolean,
) {
  if (!consent)
    throw new HttpError(
      400,
      "Allow booking messages through this provider before linking.",
    );
  const a = await booking(request, id),
    key = token(),
    sql = database();
  if (
    channel === "telegram" &&
    (!process.env.TELEGRAM_BOT_USERNAME || !process.env.TELEGRAM_BOT_TOKEN)
  )
    throw new HttpError(503, "The Telegram bot is not configured.");
  if (
    channel === "whatsapp" &&
    (!process.env.WHATSAPP_PHONE_NUMBER || !process.env.WHATSAPP_ACCESS_TOKEN)
  )
    throw new HttpError(503, "The WhatsApp business number is not configured.");
  await sql`INSERT INTO bot_pairings(token_hash,user_id,plan_id,channel) VALUES(${hash(key)},${a.role === "client" ? null : a.actor},${a.role === "client" ? a.request.plan_id : null},${channel})`;
  return {
    url:
      channel === "telegram"
        ? `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${key}`
        : `https://wa.me/${process.env.WHATSAPP_PHONE_NUMBER}?text=${encodeURIComponent("/start " + key)}`,
    expiresMinutes: 15,
  };
}
export async function incoming(
  channel: "telegram" | "whatsapp",
  updateId: string,
  address: string,
  text: string,
) {
  const sql = database();
  const duplicate = (
    await sql`SELECT id FROM bot_updates WHERE id=${`${channel}:${updateId}`}`
  )[0];
  if (duplicate) return;
  const start = text.match(/^\/?start\s+([A-Za-z0-9_-]{40,60})$/);
  if (start) {
    const linked =
      await sql`WITH claim AS (UPDATE bot_pairings SET used_at=now() WHERE token_hash=${hash(start[1])} AND channel=${channel} AND used_at IS NULL AND expires_at>now() RETURNING user_id,plan_id) INSERT INTO bot_links(id,user_id,plan_id,channel,address) SELECT ${randomUUID()},user_id,plan_id,${channel},${address} FROM claim ON CONFLICT(channel,address) DO UPDATE SET user_id=EXCLUDED.user_id,plan_id=EXCLUDED.plan_id,active=true,consent=true RETURNING id`;
    if (linked.length)
      await notify(
        `bot-paired:${channel}:${updateId}`,
        address,
        "Almaty booking messages connected",
        "Commands: /plan, /today, /message your text, /stop. You can unlink any time with /stop.",
        undefined,
        channel,
      );
    await sql`INSERT INTO bot_updates(id) VALUES(${`${channel}:${updateId}`}) ON CONFLICT DO NOTHING`;
    return;
  }
  const link = (
    await sql`SELECT * FROM bot_links WHERE channel=${channel} AND address=${address} AND active=true AND consent=true`
  )[0];
  if (!link) return;
  if (/^\/?stop\b/i.test(text)) {
    await sql`UPDATE bot_links SET active=false,consent=false WHERE id=${link.id}`;
    await notify(
      `bot-stop:${channel}:${updateId}`,
      address,
      "Disconnected",
      "Your booking messages are now disconnected.",
      undefined,
      channel,
    );
  } else {
    const r = link.plan_id
      ? (
          await sql`SELECT * FROM hub_requests WHERE plan_id=${link.plan_id} ORDER BY created_at DESC LIMIT 1`
        )[0]
      : (
          await sql`SELECT r.* FROM hub_requests r JOIN guide_assignments a ON a.request_id=r.id JOIN guides g ON g.id=a.guide_id JOIN staff_roles s ON s.user_id=g.user_id AND s.role='guide' WHERE g.user_id=${link.user_id} AND g.status<>'removed' AND a.status IN ('accepted','started','completion_requested') AND r.status='confirmed' ORDER BY a.starts_at LIMIT 1`
        )[0];
    if (!r) return;
    if (/^\/?message\s+/i.test(text)) {
      if (!["confirmed", "completed"].includes(r.status))
        throw new HttpError(409, "Chat opens after confirmation.");
      const message = text.replace(/^\/?message\s+/i, "").slice(0, 4000);
      const saved =
        await sql`INSERT INTO hub_messages(request_id,actor,visibility,body,extra) VALUES(${r.id},${link.user_id || "client"},'client',${contactUnlocked(r) ? message : scrubContacts(message)},${JSON.stringify({ kind: "text", channel, botUpdate: `${channel}:${updateId}` })}::jsonb) ON CONFLICT DO NOTHING RETURNING id`;
      if (!saved[0]) {
        await sql`INSERT INTO bot_updates(id) VALUES(${`${channel}:${updateId}`}) ON CONFLICT DO NOTHING`;
        return;
      }
      await notifyBooking(
        r.id,
        `bot-chat:${saved[0].id}`,
        "New booking message",
        "Open the private trip thread to read and reply.",
      );
    } else if (/^\/?today\b/i.test(text)) {
      const weather = await getWeather().catch(() => null);
      await notify(
        `bot-today:${channel}:${updateId}`,
        address,
        "Today in Almaty",
        weather?.advice?.clothing.join(" ") ||
          "Check the latest weather on the homepage.",
        undefined,
        channel,
      );
    } else if (/^\/?plan\b/i.test(text)) {
      const url = link.plan_id ? await privateLink(link.plan_id) : "/guide";
      await notify(
        `bot-plan:${channel}:${updateId}`,
        address,
        "Your private Almaty plan",
        url,
        undefined,
        channel,
      );
    }
  }
  await sql`INSERT INTO bot_updates(id) VALUES(${`${channel}:${updateId}`}) ON CONFLICT DO NOTHING`;
}
