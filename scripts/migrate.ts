import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { database } from "../lib/db";
import cameras from "../data/cameras.json";
import { statements } from "../lib/hub/migrate";
import { ensureCommerce } from "../lib/platform/store";
import { seedCatalog } from "../lib/hub/seed";

/**
 * Versioned migration runner.
 * - Applies every migrations/NNN-*.sql file in order, once, recording it in schema_migrations.
 * - Files 001–008 predate tracking and are idempotent; on the first tracked run they are
 *   re-applied safely and recorded.
 * - An applied file whose checksum changed aborts the run: add a new migration instead.
 * DDL uses a direct (unpooled) Neon connection; runtime traffic keeps the pooled URL.
 */
process.env.DATABASE_URL =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL?.replace(/-pooler(?=\.)/, "");
const sql = database();
const dryRun = process.argv.includes("--dry-run");

await sql`CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
const applied = new Map(
  (await sql`SELECT name, checksum FROM schema_migrations`).map((r) => [
    String(r.name),
    String(r.checksum),
  ]),
);
const dir = new URL("../migrations/", import.meta.url);
const files = (await readdir(dir))
  .filter((f) => /^\d{3}-[a-z0-9-]+\.sql$/.test(f))
  .sort();
let ran = 0;
for (const file of files) {
  const text = await readFile(new URL(file, dir), "utf8");
  const checksum = createHash("sha256").update(text).digest("hex");
  const previous = applied.get(file);
  if (previous) {
    if (previous !== checksum)
      throw new Error(
        `${file} changed after it was applied. Create a new migration instead of editing it.`,
      );
    continue;
  }
  console.log(`${dryRun ? "Would apply" : "Applying"} ${file}`);
  if (dryRun) continue;
  for (const statement of statements(text)) await sql.query(statement);
  await sql`INSERT INTO schema_migrations(name, checksum) VALUES(${file}, ${checksum})`;
  ran++;
}
if (!dryRun) {
  for (const camera of cameras)
    await sql`INSERT INTO cameras(id,config) VALUES(${camera.id},${JSON.stringify(camera)}::jsonb) ON CONFLICT(id) DO NOTHING`;
  await seedCatalog();
  await ensureCommerce();
}
console.log(
  `${ran} migration(s) applied; ${files.length - ran} already up to date.`,
);
