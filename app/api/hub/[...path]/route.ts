import { drainNotifications } from "@/lib/hub/notifications";
import { handle } from "@/lib/hub/api";
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
    const result = await handle(request, path);
    // Queueing is durable; a provider outage must not discard a valid request or quote.
    if (
      request.method === "POST" &&
      result.ok &&
      ["plans", "requests", "newsletter", "admin"].includes(path[0])
    )
      await drainNotifications().catch(() => {});
    return result;
  } catch (error) {
    const status =
      error instanceof HttpError
        ? error.status
        : error instanceof ZodError
          ? 400
          : 503;
    const message =
      error instanceof HttpError
        ? error.message
        : error instanceof ZodError
          ? "Some fields are invalid. Check dates, prices and required values."
          : "This service is temporarily unavailable. Your saved data has been retained.";
    return Response.json(
      { error: message },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export const GET = route;
export const POST = route;
