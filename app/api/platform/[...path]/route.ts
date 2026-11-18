import { after } from "next/server";
import { drainNotifications } from "@/lib/hub/notifications";
import { handlePlatform } from "@/lib/platform/api";
import { HttpError } from "@/lib/hub/security";
import { ZodError } from "zod";
export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";
async function route(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await context.params).path;
    const result = await handlePlatform(request, path);
    if (
      request.method === "POST" &&
      result.ok &&
      path[0] !== "assistant" &&
      path[1] !== "research" &&
      (process.env.RESEND_API_KEY ||
        process.env.TELEGRAM_BOT_TOKEN ||
        process.env.WHATSAPP_ACCESS_TOKEN)
    )
      after(() =>
        drainNotifications()
          .then(() => {})
          .catch(() => {}),
      );
    return result;
  } catch (error) {
    const status =
      error instanceof HttpError
        ? error.status
        : error instanceof ZodError
          ? 400
          : 503;
    return Response.json(
      {
        error:
          error instanceof HttpError
            ? error.message
            : error instanceof ZodError
              ? "Some fields are invalid. Check required values, dates and prices."
              : "This service is temporarily unavailable. Saved records have been retained.",
      },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
export const GET = route;
export const POST = route;
