import { getAuth } from "@/lib/auth/server";
import { NextRequest } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/auth/owner";
import { limit, HttpError } from "@/lib/hub/security";
export const runtime = "nodejs";

/**
 * Email one-time-code sign-in for everyone (tourists, guides, admins, owner).
 * Roles are never taken from the client: they are resolved on the server from
 * OWNER_EMAILS and the staff_roles table (lib/auth/session.ts).
 */
const ALLOWED = new Set([
  "get-session",
  "sign-out",
  "email-otp/send-verification-otp",
  "sign-in/email-otp",
]);
const otpRequest = z.object({
  email: z.email().max(254),
  type: z.literal("sign-in").optional(),
  otp: z.string().trim().max(12).optional(),
});

async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  if (!process.env.NEON_AUTH_BASE_URL)
    return Response.json(
      { error: "Sign-in is not configured." },
      { status: 503 },
    );
  const path = new URL(request.url).pathname.replace("/api/auth/", "");
  if (!ALLOWED.has(path))
    return Response.json(
      { error: "This authentication method is disabled." },
      { status: 403 },
    );
  if (request.method === "POST") {
    if (!sameOrigin(request))
      return Response.json({ error: "Invalid origin." }, { status: 403 });
    if (path !== "sign-out") {
      const parsed = otpRequest.safeParse(
        await request
          .clone()
          .json()
          .catch(() => null),
      );
      if (!parsed.success)
        return Response.json({ error: "Enter a valid email address." }, { status: 400 });
      try {
        // Bound code requests per IP to protect the email sender and slow guessing.
        await limit(request, `auth:${path}`, path.startsWith("email-otp") ? 8 : 20);
      } catch (error) {
        if (error instanceof HttpError)
          return Response.json({ error: error.message }, { status: error.status });
        // A database outage must not block sign-in; the provider applies its own limits.
      }
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
