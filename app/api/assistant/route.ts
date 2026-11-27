import { randomUUID } from "node:crypto";
import { z } from "zod";
import { database } from "@/lib/db";
import { body, hash, HttpError, limit, origin } from "@/lib/hub/security";
import { claudeConfigured } from "@/lib/ai/claude";
import { currentUser } from "@/lib/auth/session";
import { assistantSettings } from "@/lib/assistant/settings";
import { runAssistant, type AssistantEvent } from "@/lib/assistant/run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const input = z.object({
  message: z.string().trim().min(1).max(2000),
  conversationId: z.string().regex(/^ac_[a-z0-9]{20}$/).optional(),
  language: z.enum(["en", "ru", "kk"]).default("en"),
});
const MAX_MESSAGES_PER_CONVERSATION = 40;

function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    origin(request);
    const settings = await assistantSettings();
    if (!settings.enabled) return fail(503, "The travel assistant is turned off right now. Our team is happy to help by email or WhatsApp.");
    if (!claudeConfigured())
      return fail(503, "The AI assistant is not configured yet (ANTHROPIC_API_KEY is missing on the server). You can still build a tour at /build.");
    const q = input.parse(await body(request));
    await limit(request, "assistant", settings.hourlyLimit);
    const sql = database();
    const today = await sql`SELECT count(*)::int AS n FROM assistant_messages WHERE role='user' AND created_at > date_trunc('day', now())`;
    if (Number(today[0]?.n || 0) >= settings.dailyLimit)
      return fail(429, "The assistant is very busy today. Please try again tomorrow or contact our team.");
    const user = await currentUser();
    const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0] || request.headers.get("x-forwarded-for")?.split(",")[0] || "local";
    const visitor = hash(`${user?.id || ip}:${process.env.NEON_AUTH_COOKIE_SECRET || "local"}`);
    let conversationId = q.conversationId;
    let history: { role: "user" | "assistant"; content: string }[] = [];
    if (conversationId) {
      const conv = (await sql`SELECT id,message_count FROM assistant_conversations WHERE id=${conversationId} AND visitor_hash=${visitor}`)[0];
      if (!conv) conversationId = undefined;
      else {
        if (Number(conv.message_count) >= MAX_MESSAGES_PER_CONVERSATION)
          return fail(429, "This conversation is long — please start a new one.");
        history = (
          await sql`SELECT role,content FROM assistant_messages WHERE conversation_id=${conversationId} AND role IN ('user','assistant') ORDER BY id DESC LIMIT 20`
        )
          .reverse()
          .map((m) => ({ role: m.role as "user" | "assistant", content: String(m.content) }));
        // The API requires alternating turns that start with the user.
        while (history.length && history[0].role !== "user") history.shift();
      }
    }
    if (!conversationId) {
      conversationId = `ac_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
      await sql`INSERT INTO assistant_conversations(id,user_id,visitor_hash,language,title) VALUES(${conversationId},${user?.id || null},${visitor},${q.language},${q.message.slice(0, 80)})`;
    }
    if (settings.storeConversations)
      await sql`INSERT INTO assistant_messages(conversation_id,role,content) VALUES(${conversationId},'user',${q.message})`;
    const id = conversationId;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (e: AssistantEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        send({ type: "start", conversationId: id });
        for await (const event of runAssistant({ history, userText: q.message, lang: q.language, settings })) {
          send(event);
          if (event.type === "done") {
            await sql`UPDATE assistant_conversations SET message_count=message_count+2,input_tokens=input_tokens+${event.usage.input},output_tokens=output_tokens+${event.usage.output},updated_at=now() WHERE id=${id}`.catch(() => {});
            if (settings.storeConversations && event.text)
              await sql`INSERT INTO assistant_messages(conversation_id,role,content,tools) VALUES(${id},'assistant',${event.text},${JSON.stringify(event.tools)}::jsonb)`.catch(() => {});
          }
        }
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
    });
  } catch (error) {
    if (error instanceof HttpError) return fail(error.status, error.message);
    if (error instanceof z.ZodError) return fail(400, "Please write a message of up to 2000 characters.");
    return fail(503, "The assistant is temporarily unavailable. Please try again in a moment.");
  }
}
