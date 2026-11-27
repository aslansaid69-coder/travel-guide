/**
 * Local stand-in for Neon's HTTP SQL endpoint, backed by a normal Postgres.
 * Lets `@neondatabase/serverless` (used by the app) run against a local database in tests.
 *
 *   LOCAL_PG_URL=postgres://postgres@localhost/travel_test node --import tsx scripts/dev/neon-http-shim.ts
 *
 * Then point the driver at it: neonConfig.fetchEndpoint = "http://localhost:4444/sql".
 * Development/test only — never deploy this.
 */
import { createServer } from "node:http";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.LOCAL_PG_URL, max: 4 });
const raw = { getTypeParser: () => (v: string) => v };
type Q = { query: string; params: unknown[] };

async function run(client: pg.PoolClient, q: Q) {
  const r = await client.query({ text: q.query, values: q.params, rowMode: "array", types: raw });
  return {
    fields: r.fields.map((f) => ({ name: f.name, dataTypeID: f.dataTypeID })),
    rows: r.rows,
    command: r.command,
    rowCount: r.rowCount,
  };
}

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const body = JSON.parse(Buffer.concat(chunks).toString() || "{}") as Q | { queries: Q[] };
  const client = await pool.connect();
  try {
    let out: unknown;
    if ("queries" in body) {
      await client.query("BEGIN");
      const results = [];
      for (const q of body.queries) results.push(await run(client, q));
      await client.query("COMMIT");
      out = { results };
    } else out = await run(client, body);
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(out));
  } catch (e) {
    if ("queries" in body) await client.query("ROLLBACK").catch(() => {});
    const err = e as pg.DatabaseError;
    res
      .writeHead(400, { "content-type": "application/json" })
      .end(JSON.stringify({ message: err.message, code: err.code, detail: err.detail, constraint: err.constraint }));
  } finally {
    client.release();
  }
});
server.listen(Number(process.env.SHIM_PORT || 4444), () =>
  console.log(`neon-http-shim on :${process.env.SHIM_PORT || 4444}`),
);
