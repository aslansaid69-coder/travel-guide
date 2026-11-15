import { getAuth } from "@/lib/auth/server";
import { NextRequest } from "next/server";
import { ownerEmails, sameOrigin } from "@/lib/auth/owner";
export const runtime = "nodejs";
async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  if (!process.env.NEON_AUTH_BASE_URL)
    return Response.json(
      { error: "Staff login is not configured." },
      { status: 503 },
    );
  // This stage exposes owner email-code login only. Additional roles arrive with the manager workflow.
  const path = new URL(request.url).pathname.replace("/api/auth/", "");
  if (
    ![
      "get-session",
      "sign-out",
      "email-otp/send-verification-otp",
      "sign-in/email-otp",
    ].includes(path)
  )
    return Response.json(
      { error: "This authentication method is disabled." },
      { status: 403 },
    );
  if (request.method === "POST") {
    if (!sameOrigin(request))
      return Response.json({ error: "Invalid origin." }, { status: 403 });
    try {
      const body = await request.clone().json();
      if (
        path !== "sign-out" &&
        (!ownerEmails().includes(String(body.email || "").toLowerCase()) ||
          (body.type && body.type !== "sign-in"))
      )
        return Response.json(
          { error: "This address is not enabled for staff access." },
          { status: 403 },
        );
    } catch {
      return Response.json({ error: "Invalid request." }, { status: 400 });
    }
  }
  try {
    const handlers = getAuth().handler();
    return await handlers[request.method as "GET" | "POST"](request, context);
  } catch {
    return Response.json(
      { error: "Sign-in service unavailable. Please try again." },
      { status: 503 },
    );
  }
}
export const GET = handle;
export const POST = handle;
