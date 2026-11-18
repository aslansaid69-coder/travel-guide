import { after } from "next/server";
import { drainNotifications } from "@/lib/hub/notifications";
import { incoming, verifyHmac, sameSecret } from "@/lib/platform/bots";
import { boundedBody } from "@/lib/updates/body";
import { database } from "@/lib/db";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  if (
    q.get("hub.mode") === "subscribe" &&
    sameSecret(
      q.get("hub.verify_token") || "",
      process.env.WHATSAPP_VERIFY_TOKEN || "",
    )
  )
    return new Response(q.get("hub.challenge") || "");
  return new Response("Unauthorized", { status: 401 });
}
export async function POST(request: Request) {
  const raw = await boundedBody(new Response(request.body), 250000);
  if (
    !verifyHmac(
      raw,
      request.headers.get("x-hub-signature-256") || "",
      process.env.WHATSAPP_APP_SECRET || "",
    )
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const d = JSON.parse(raw);
    for (const e of d.entry || [])
      for (const c of e.changes || []) {
        if (
          c.value?.metadata?.phone_number_id !==
          process.env.WHATSAPP_PHONE_NUMBER_ID
        )
          continue;
        for (const m of c.value?.messages || []) {
          if (m.type === "text" && /^\d{8,16}$/.test(m.from)) {
            await database()`INSERT INTO whatsapp_windows(address,last_inbound) VALUES(${m.from},now()) ON CONFLICT(address) DO UPDATE SET last_inbound=now()`;
            await incoming("whatsapp", m.id, m.from, m.text.body);
          }
        }
      }
    after(() =>
      drainNotifications()
        .then(() => {})
        .catch(() => {}),
    );
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Retry delivery" }, { status: 500 });
  }
}
