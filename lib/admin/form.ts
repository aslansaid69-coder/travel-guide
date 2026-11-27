import { redirect } from "next/navigation";
import { z } from "zod";

/** FormData → plain object (repeated keys become arrays) for zod validation. */
export function formObject(fd: FormData) {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of fd.entries()) {
    if (typeof v !== "string") continue;
    const prev = out[k];
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return out;
}

export function parseForm<T extends z.ZodType>(schema: T, fd: FormData): z.infer<T> {
  return schema.parse(formObject(fd));
}

/** Redirect back to an admin page with a one-line status message. */
export function back(path: string, notice: string, tone: "ok" | "bad" = "ok"): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${tone === "ok" ? "notice" : "error"}=${encodeURIComponent(notice)}`);
}

/** Human-readable message for zod / HttpError / unknown failures. */
export function failure(error: unknown) {
  if (error instanceof z.ZodError)
    return error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
      .join("; ");
  if (error instanceof Error && "status" in error) return error.message;
  return "Something went wrong. Nothing was changed.";
}

/** Next's redirect() works by throwing; never swallow it in catch blocks. */
export function isRedirect(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}
