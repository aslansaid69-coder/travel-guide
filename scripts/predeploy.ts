/**
 * Runs before `next build` on Vercel (package.json "vercel-build").
 * Production deploys apply pending migrations first; if a migration fails, the build fails
 * and Vercel keeps serving the previous deployment. Preview deploys never touch the database.
 */
import { spawnSync } from "node:child_process";

const env = process.env.VERCEL_ENV;
if (env !== "production") {
  console.log(`[predeploy] VERCEL_ENV=${env ?? "unset"}: skipping migrations.`);
  process.exit(0);
}
if (!process.env.DATABASE_URL) {
  console.error("[predeploy] DATABASE_URL is missing in Production; refusing to deploy without the database.");
  process.exit(1);
}
const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], { stdio: "inherit" });
process.exit(run.status ?? 1);
