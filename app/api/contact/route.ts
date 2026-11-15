import { validateContact } from "@/lib/contact";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  // Next.js can expose an internal localhost URL; validate against the public Host header.
  let sameOrigin = false;
  try {
    const url = new URL(origin || "");
    sameOrigin =
      ["https:", "http:"].includes(url.protocol) &&
      url.host === (request.headers.get("host") || new URL(request.url).host);
  } catch {
    /* Invalid or missing origin. */
  }
  if (!sameOrigin)
    return Response.json(
      { error: "Please send your message from our website." },
      { status: 403 },
    );
  if (!request.headers.get("content-type")?.includes("application/json"))
    return Response.json({ error: "Invalid request." }, { status: 415 });
  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (raw.length > 10_000)
    return Response.json(
      { error: "Your message is too long." },
      { status: 413 },
    );
  let data;
  try {
    data = validateContact(JSON.parse(raw));
  } catch {
    /* Invalid JSON is handled below. */
  }
  if (!data)
    return Response.json(
      {
        error:
          "Please check your name, email, and message (10–4,000 characters).",
      },
      { status: 400 },
    );
  if (data.website) return Response.json({ ok: true }); // Honeypot, no email sent.
  const { RESEND_API_KEY, CONTACT_FROM, CONTACT_TO } = process.env;
  // Use a verified sender domain. Keys stay on the server; no message is stored in this app.
  // Enable host-level rate limiting/bot protection before public launch.
  if (!RESEND_API_KEY || !CONTACT_FROM || !CONTACT_TO)
    return Response.json(
      {
        error:
          "Our contact form is temporarily unavailable. Please try again later.",
      },
      { status: 503 },
    );
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: CONTACT_FROM,
        to: [CONTACT_TO],
        reply_to: data.email,
        subject: `Almaty guide: message from ${data.name}`,
        text: `Name: ${data.name}\nEmail: ${data.email}\n\n${data.message}`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Email provider unavailable");
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      {
        error: "Your message could not be sent. Please try again in a moment.",
      },
      { status: 502 },
    );
  }
}
