import "server-only";
import { headers } from "next/headers";
import { database } from "@/lib/db";
import { hash, HttpError } from "@/lib/hub/security";

/** Per-IP (or per-user) hourly limit for server actions, stored in hub_rate_limits. */
export async function actionLimit(action: string, max: number, subject?: string) {
  const h = await headers();
  const who =
    subject ||
    h.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local";
  const key = hash(`${action}:${who}:${process.env.NEON_AUTH_COOKIE_SECRET || "local"}:${Math.floor(Date.now() / 3600000)}`);
  const rows =
    await database()`INSERT INTO hub_rate_limits(key,hits,expires_at) VALUES(${key},1,now()+interval '2 hours') ON CONFLICT(key) DO UPDATE SET hits=hub_rate_limits.hits+1 RETURNING hits`;
  if (Number(rows[0]?.hits) > max) throw new HttpError(429, "Too many requests. Please try again in a little while.");
}
