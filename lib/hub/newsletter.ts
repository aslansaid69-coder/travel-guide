import { createHmac, timingSafeEqual } from "node:crypto";
export function unsubscribeToken(id: string) {
  return createHmac(
    "sha256",
    process.env.NEON_AUTH_COOKIE_SECRET || "not-configured",
  )
    .update(`unsubscribe:${id}`)
    .digest("base64url");
}
export function validUnsubscribe(id: string, token: string) {
  const a = Buffer.from(unsubscribeToken(id)),
    b = Buffer.from(token);
  return (
    !!process.env.NEON_AUTH_COOKIE_SECRET &&
    a.length === b.length &&
    timingSafeEqual(a, b)
  );
}
