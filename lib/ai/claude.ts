import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { HttpError } from "@/lib/hub/security";

/**
 * Server-only Claude client. The key comes from ANTHROPIC_API_KEY and never reaches the browser.
 * ANTHROPIC_MODEL overrides the default model.
 */
export const CLAUDE_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export function claudeConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

let client: Anthropic | null = null;
export function claude() {
  if (!process.env.ANTHROPIC_API_KEY)
    throw new HttpError(
      503,
      "AI is not configured: add ANTHROPIC_API_KEY to the server environment (Vercel → Settings → Environment Variables).",
    );
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 60_000 });
  return client;
}

/** Maps SDK errors to user-facing messages without leaking provider details. */
export function claudeError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (error instanceof Anthropic.AuthenticationError)
    return new HttpError(503, "The AI key was rejected. Check ANTHROPIC_API_KEY.");
  if (error instanceof Anthropic.PermissionDeniedError)
    return new HttpError(503, "The AI key has no access to this model.");
  if (error instanceof Anthropic.RateLimitError)
    return new HttpError(429, "The AI service is busy. Please try again in a minute.");
  if (error instanceof Anthropic.BadRequestError)
    return new HttpError(400, "The AI service could not process this request.");
  if (error instanceof Anthropic.APIConnectionError)
    return new HttpError(503, "The AI service is unreachable right now.");
  if (error instanceof Anthropic.APIError)
    return new HttpError(503, "The AI service is temporarily unavailable.");
  return new HttpError(503, "The AI service is temporarily unavailable.");
}
