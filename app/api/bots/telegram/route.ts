import { after } from "next/server";
import { drainNotifications } from "@/lib/hub/notifications";
import { incoming, sameSecret } from "@/lib/platform/bots";
import { boundedBody } from "@/lib/updates/body";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (
    !sameSecret(
      request.headers.get("x-telegram-bot-api-secret-token") || "",
      process.env.TELEGRAM_WEBHOOK_SECRET || "",
    )
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const d = JSON.parse(await boundedBody(new Response(request.body), 100000));
    const m = d.message;
    if (
      m?.chat?.type === "private" &&
      typeof m.text === "string" &&
      Number.isSafeInteger(d.update_id) &&
      m.from?.id === m.chat.id
    )
      await incoming(
        "telegram",
        String(d.update_id),
        String(m.chat.id),
        m.text,
      );
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
