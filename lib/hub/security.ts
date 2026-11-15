import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { database } from "@/lib/db";
import { sameOrigin } from "@/lib/auth/owner";
import { boundedBody } from "@/lib/updates/body";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const token = () => randomBytes(32).toString("base64url");
export const hash = (v: string) => createHash("sha256").update(v).digest("hex");
export function matches(v: string, stored: string) {
  const a = Buffer.from(hash(v)),
    b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function origin(request: Request) {
  if (!sameOrigin(request)) throw new HttpError(403, "Invalid request origin.");
}
export async function body(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "JSON is required.");
  try {
    return JSON.parse(await boundedBody(new Response(request.body), 180000));
  } catch {
    throw new HttpError(400, "Invalid or oversized request.");
  }
}
export async function limit(request: Request, action: string, max = 20) {
  const ip =
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0] ||
    request.headers.get("x-forwarded-for")?.split(",")[0] ||
    "local";
  const key = hash(
    `${action}:${ip}:${process.env.NEON_AUTH_COOKIE_SECRET || "local"}:${Math.floor(Date.now() / 3600000)}`,
  );
  const sql = database();
  const rows =
    await sql`INSERT INTO hub_rate_limits(key,hits,expires_at) VALUES(${key},1,now()+interval '2 hours') ON CONFLICT(key) DO UPDATE SET hits=hub_rate_limits.hits+1 RETURNING hits`;
  if (Number(rows[0].hits) > max)
    throw new HttpError(429, "Too many requests. Please try again later.");
}
export function safeUrl(v: string) {
  if (!v) return "";
  if (v.startsWith("/images/") && !v.includes("..")) return v;
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password ? v : "";
  } catch {
    return "";
  }
}
