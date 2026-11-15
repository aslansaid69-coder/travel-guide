import { readFile } from "node:fs/promises";
import { database } from "../lib/db";
import cameras from "../data/cameras.json";
const sql = database();
for (const file of ["001-camera-operations.sql", "002-source-updates.sql"]) {
  const migration = await readFile(
    new URL(`../migrations/${file}`, import.meta.url),
    "utf8",
  );
  for (const statement of migration
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await sql.query(statement);
}
for (const camera of cameras)
  await sql`INSERT INTO cameras(id,config) VALUES(${camera.id},${JSON.stringify(camera)}::jsonb) ON CONFLICT(id) DO NOTHING`;
console.log("Camera schema applied and approved seed cameras added.");
