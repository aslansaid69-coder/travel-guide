import { neon, neonConfig } from "@neondatabase/serverless";

// Tests/dev only: route the HTTP driver to scripts/dev/neon-http-shim.ts (local Postgres).
if (process.env.NEON_HTTP_SHIM && process.env.NODE_ENV !== "production")
  neonConfig.fetchEndpoint = process.env.NEON_HTTP_SHIM;

export function database() {
  if (!process.env.DATABASE_URL) throw new Error("Database is not configured.");
  return neon(process.env.DATABASE_URL);
}
