import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "../lib/db";
import {
  createPlan,
  editable,
  getPlan,
  savePlan,
  privateLink,
} from "../lib/hub/store";
import { autoPublish } from "../lib/hub/publish";
import { itemSchema } from "../lib/hub/types";
import { planSchema } from "../lib/hub/types";
import { handle } from "../lib/hub/api";
import { planPdf } from "../lib/hub/pdf";
if (process.env.INTEGRATION_BRANCH !== "stage-2-updates-test")
  throw new Error("Use the isolated test branch only.");
const sql = database(),
  prefix = `integration-${randomUUID()}`,
  date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
const plan = planSchema.parse({
  title: "Integration trip",
  startDate: date,
  adults: 2,
  days: [
    { stops: [{ id: "s", itemId: "panfilov", start: "10:00", duration: 60 }] },
  ],
});
const p = await createPlan(plan),
  r1 = `${prefix}-r1`,
  r2 = `${prefix}-r2`,
  r3 = `${prefix}-r3`,
  slot = `${prefix}-slot`,
  slot2 = `${prefix}-slot2`,
  q = `${prefix}-quote`,
  session = `${prefix}-session`;
const originalSettings = (
  await sql`SELECT data FROM hub_settings WHERE id=true`
)[0].data;
try {
  await editable(p.id, p.editToken);
  const mailLink = await privateLink(p.id);
  const mailKey = new URLSearchParams(new URL(mailLink).hash.slice(1)).get(
    "edit",
  )!;
  await editable(p.id, mailKey);
  await sql`UPDATE hub_access_links SET expires_at=now()-interval '1 second' WHERE plan_id=${p.id}`;
  await assert.rejects(editable(p.id, mailKey));
  await assert.rejects(editable(p.id, "invalid"));
  const publicPlan = await getPlan(p.id);
  assert.deepEqual(Object.keys(publicPlan).sort(), ["data", "id", "version"]);
  assert.equal(await savePlan(p.id, { ...plan, title: "Updated" }, 1), 2);
  await assert.rejects(savePlan(p.id, plan, 1), /changed/);
  const pdf = await planPdf(plan, []);
  assert.equal(Buffer.from(pdf).subarray(0, 4).toString(), "%PDF");
  const admin = await handle(new Request("https://example.com/api/hub/admin"), [
    "admin",
  ]).catch((e) => e);
  assert.equal(admin.status, 401);
  const forbidden = await handle(
    new Request("https://example.com/api/hub/plans", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: "{}",
    }),
    ["plans"],
  ).catch((e) => e);
  assert.equal(forbidden.status, 403);
  for (const id of [r1, r2, r3])
    await sql`INSERT INTO hub_requests(id,plan_id,guest,idempotency_key) VALUES(${id},${p.id},'{"email":"integration@example.com"}'::jsonb,${id})`;
  await sql`INSERT INTO hub_slots(id,item_id,starts_at,ends_at,capacity) VALUES(${slot},'panfilov',now()+interval '3 days',now()+interval '3 days 1 hour',3),(${slot2},'panfilov',now()+interval '4 days',now()+interval '4 days 1 hour',1)`;
  await assert.rejects(
    sql`SELECT hub_save_slot(${prefix + "-overlap"},'panfilov',now()+interval '3 days 15 minutes',now()+interval '3 days 45 minutes',4,false)`,
  );
  const outcomes = await Promise.allSettled(
    [r1, r2].map(
      (id) =>
        sql`SELECT hub_reserve(${id},${JSON.stringify([slot])}::jsonb,2,true)`,
    ),
  );
  assert.equal(
    outcomes.filter((r) => r.status === "fulfilled").length,
    1,
    "Only one group fits",
  );
  const winner = outcomes[0].status === "fulfilled" ? r1 : r2,
    loser = winner === r1 ? r2 : r1;
  await assert.rejects(
    sql`SELECT hub_reserve(${loser},${JSON.stringify([slot, slot2])}::jsonb,2,false)`,
  );
  assert.equal(
    (
      await sql`SELECT count(*)::int AS n FROM hub_holds WHERE request_id=${loser} AND state<>'released'`
    )[0].n,
    0,
    "Failed package reserves no partial inventory",
  );
  await assert.rejects(
    sql`SELECT hub_save_slot(${slot},'panfilov',now()+interval '3 days',now()+interval '3 days 1 hour',1,false)`,
  );
  await sql`UPDATE hub_holds SET state='held',expires_at=now()-interval '1 minute' WHERE request_id=${winner}`;
  await sql`SELECT hub_reserve(${loser},${JSON.stringify([slot])}::jsonb,2,false)`;
  await sql`UPDATE hub_requests SET quote_id=${q} WHERE id=${loser}`;
  await sql`INSERT INTO hub_quotes(id,request_id,plan_version,plan,breakdown,amount_minor,currency,deposit_percent,terms,status) VALUES(${q},${loser},2,${JSON.stringify(plan)}::jsonb,'{}',100000,'KZT',30,'Test','approved')`;
  await sql`INSERT INTO hub_payment_sessions(id,request_id,quote_id,amount_minor,currency) VALUES(${session},${loser},${q},30000,'KZT')`;
  const events = await Promise.all(
    [1, 2].map(
      () =>
        sql`SELECT hub_apply_payment(${prefix + "-event"},${session},30000,'kzt') AS status`,
    ),
  );
  assert(events.some((e) => e[0].status === "confirmed"));
  assert(events.some((e) => e[0].status === "duplicate"));
  assert.equal(
    Number(
      (await sql`SELECT paid_minor FROM hub_requests WHERE id=${loser}`)[0]
        .paid_minor,
    ),
    30000,
    "Repeated webhooks cannot double the paid amount",
  );
  assert.equal(
    (
      await sql`SELECT state FROM hub_holds WHERE request_id=${loser} AND slot_id=${slot}`
    )[0].state,
    "confirmed",
  );
  const lateQuote = `${prefix}-late-quote`,
    lateSession = `${prefix}-late-session`;
  await sql`UPDATE hub_requests SET quote_id=${lateQuote} WHERE id=${winner}`;
  await sql`INSERT INTO hub_quotes(id,request_id,plan_version,plan,breakdown,amount_minor,currency,deposit_percent,terms,status) VALUES(${lateQuote},${winner},2,${JSON.stringify(plan)}::jsonb,'{}',100000,'KZT',30,'Test','approved')`;
  await sql`INSERT INTO hub_payment_sessions(id,request_id,quote_id,amount_minor,currency) VALUES(${lateSession},${winner},${lateQuote},30000,'KZT')`;
  const late =
    await sql`SELECT hub_apply_payment(${prefix + "-late-event"},${lateSession},30000,'KZT') AS status`;
  assert.equal(
    late[0].status,
    "capacity-review",
    "A payment after hold expiry must not overbook the newly reserved slot",
  );
  assert.equal(
    (await sql`SELECT status FROM hub_requests WHERE id=${winner}`)[0].status,
    "new",
  );
  await sql`UPDATE hub_requests SET status='cancelled' WHERE id=${r3}`;
  await assert.rejects(
    sql`SELECT hub_reserve(${r3},${JSON.stringify([slot2])}::jsonb,1,true)`,
  );
  await assert.rejects(
    sql`SELECT hub_apply_payment(${prefix + "-bad-event"},${session},999,'KZT')`,
  );
  await sql`UPDATE hub_settings SET data=jsonb_set(data,'{autoPublish}','true'::jsonb) WHERE id=true`;
  const candidate = itemSchema.parse({
    id: prefix + "-auto",
    name: "Test discovery",
    category: "museum",
    lat: 43,
    lng: 76,
    rating: 4.5,
    reviews: 100,
    source: "Permitted independent test feed",
    sourceUrl: "https://example.com/allowed",
    price: {
      type: "fixed",
      min: 1000,
      max: 1000,
      currency: "KZT",
      source: "owner-confirmed",
      updatedAt: "2026-11-16",
    },
  });
  assert.equal(await autoPublish([candidate], "integration.feed"), 1);
  const published = (
    await sql`SELECT data,status FROM hub_catalog WHERE id=${candidate.id}`
  )[0];
  assert.equal(published.status, "approved");
  assert.equal(published.data.price.source, "estimated");
  await sql`UPDATE hub_catalog SET status='hidden' WHERE id=${candidate.id}`;
  assert.equal(
    await autoPublish(
      [{ ...candidate, name: "Must remain hidden" }],
      "integration.feed",
    ),
    0,
  );
  assert.equal(
    (await sql`SELECT data,status FROM hub_catalog WHERE id=${candidate.id}`)[0]
      .status,
    "hidden",
  );
  console.log(
    "Hub integration passed: private access, no public PII, optimistic saves, PDF, CSRF/admin guards, concurrent capacity, atomic rollback, expiry, webhook deduplication and cancellation.",
  );
} finally {
  await sql`UPDATE hub_settings SET data=${JSON.stringify(originalSettings)}::jsonb WHERE id=true`;
  await sql`DELETE FROM admin_audit WHERE resource LIKE ${prefix + "%"}`;
  await sql`DELETE FROM hub_catalog WHERE id LIKE ${prefix + "%"}`;
  await sql`DELETE FROM hub_payment_events WHERE id LIKE ${prefix + "%"}`;
  await sql`DELETE FROM hub_payment_sessions WHERE id LIKE ${prefix + "%"}`;
  await sql`DELETE FROM hub_holds WHERE request_id LIKE ${prefix + "%"}`;
  await sql`DELETE FROM hub_quotes WHERE id LIKE ${prefix + "%"}`;
  await sql`DELETE FROM hub_messages WHERE request_id LIKE ${prefix + "%"}`;
  await sql`DELETE FROM hub_checkout_leases WHERE request_id LIKE ${prefix + "%"}`;
  await sql`DELETE FROM hub_requests WHERE id LIKE ${prefix + "%"}`;
  await sql`DELETE FROM hub_slots WHERE id LIKE ${prefix + "%"}`;
  await sql`DELETE FROM hub_access_links WHERE plan_id=${p.id}`;
  await sql`DELETE FROM hub_plans WHERE id=${p.id}`;
}
