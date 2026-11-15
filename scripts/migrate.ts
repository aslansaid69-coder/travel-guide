import { readFile } from "node:fs/promises";
import { database } from "../lib/db";
import cameras from "../data/cameras.json";
import { statements } from "../lib/hub/migrate";
import { seedCatalog } from "../lib/hub/seed";
// DDL uses a direct Neon connection; runtime app traffic keeps the pooled URL.
process.env.DATABASE_URL =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL?.replace(/-pooler(?=\.)/, "");
const sql = database();
for (const file of [
  "001-camera-operations.sql",
  "002-source-updates.sql",
  "003-travel-hub.sql",
  "004-discovery-review.sql",
  "005-inventory-guards.sql",
]) {
  const migration = await readFile(
    new URL(`../migrations/${file}`, import.meta.url),
    "utf8",
  );
  for (const statement of statements(migration)) await sql.query(statement);
}
for (const camera of cameras)
  await sql`INSERT INTO cameras(id,config) VALUES(${camera.id},${JSON.stringify(camera)}::jsonb) ON CONFLICT(id) DO NOTHING`;
await seedCatalog();
console.log("Migrations applied; approved cameras and guide places retained.");
