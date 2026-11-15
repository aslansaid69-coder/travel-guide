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
    return await handle(request, (await context.params).path);
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
