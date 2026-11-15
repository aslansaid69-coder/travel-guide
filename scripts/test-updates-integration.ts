import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "../lib/db";
import { runUpdate } from "../lib/updates/jobs";
import {
  beginRun,
  saveResult,
  readSnapshot,
  finishRun,
  lease,
  release,
} from "../lib/updates/store";
if (process.env.INTEGRATION_BRANCH !== "stage-2-updates-test")
  throw new Error("Run only with the isolated .env.stage2-test database.");
const sql = database(),
  key = `integration.${randomUUID()}`,
  job = key,
  adapter = {
    key,
    kind: "weather" as const,
    label: "Isolated integration fixture",
  };
const runIds = [1, 2, 3, 4].map((i) => `${key}:${i}`);
for (const id of runIds) await beginRun(id, job, "integration-test");
await saveResult(
  runIds[0],
  adapter,
  {
    status: "success",
    reason: "Fixture",
    requests: 0,
    data: { temperature: 17 },
    revision: "good",
  },
  1,
);
const before = await readSnapshot(key);
assert.ok(before?.lastSuccess);
await saveResult(
  runIds[1],
  adapter,
  { status: "failed", reason: "Source returned HTTP 503.", requests: 1 },
  1,
);
const failed = await readSnapshot(key);
assert.deepEqual(failed?.data, { temperature: 17 });
assert.equal(failed?.lastSuccess, before?.lastSuccess);
assert.equal(failed?.failures, 1);
await finishRun(runIds[0], job, "failed", {}, true);
let alerts = await sql`SELECT id FROM notification_outbox WHERE job=${job}`;
assert.equal(alerts.length, 0);
await finishRun(runIds[1], job, "failed", {}, true);
alerts = await sql`SELECT id FROM notification_outbox WHERE job=${job}`;
assert.equal(alerts.length, 1);
await finishRun(runIds[1], job, "failed", {}, true);
await finishRun(runIds[2], job, "failed", {}, true);
alerts = await sql`SELECT id FROM notification_outbox WHERE job=${job}`;
assert.equal(alerts.length, 1);
await finishRun(runIds[3], job, "success", {}, false);
const state = await sql`SELECT failures FROM update_job_state WHERE job=${job}`;
assert.equal(state[0].failures, 0);
const resolved =
  await sql`SELECT status FROM notification_outbox WHERE job=${job}`;
assert.equal(resolved[0].status, "resolved");
assert.equal(await lease("integration-first"), true);
try {
  assert.equal(await lease("integration-second"), false);
} finally {
  await release("integration-first");
}
assert.equal(await lease("integration-busy-job"), true);
try {
  const before = await sql`SELECT failures FROM update_job_state WHERE job='weather'`;
  const busy = await runUpdate("weather", "integration-busy-worker", true);
  assert.equal(busy.busy, true);
  const skipped = await sql`SELECT status FROM update_runs WHERE actor='integration-busy-worker' ORDER BY started_at DESC LIMIT 1`;
  assert.equal(skipped[0].status, "skipped");
  const after = await sql`SELECT failures FROM update_job_state WHERE job='weather'`;
  assert.deepEqual(after, before);
} finally {
  await release("integration-busy-job");
}
console.log(
  "Integration passed: last-good retention, timestamps, alert threshold, deduplication, recovery and exclusive job lease.",
);
