import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { database } from "../lib/db";
import { createPlan } from "../lib/hub/store";
import { planSchema } from "../lib/hub/types";
if (process.env.INTEGRATION_BRANCH !== "platform-v2-test-2026-11-19")
  throw new Error("Use the isolated platform branch.");
const base = process.env.PLATFORM_TEST_ORIGIN || "http://127.0.0.1:3102";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))
  throw new Error("HTTP fixtures must target the owned local test server.");
const sql = database(),
  id = "http-" + randomUUID(),
  p = await createPlan(
    planSchema.parse({
      title: "HTTP private fixture",
      startDate: "2026-12-20",
      adults: 2,
      days: [
        {
          stops: [
            { id: "s", itemId: "panfilov", start: "10:00", duration: 60 },
          ],
        },
      ],
    }),
  );
let count = 0;
const check = (name: string) => console.log(`PASS ${++count}: ${name}`);
try {
  await sql`INSERT INTO hub_requests(id,plan_id,guest,idempotency_key) VALUES(${id},${p.id},' {"name":"Private HTTP fixture","email":"private@example.test","language":"en"}'::jsonb,${id})`;
  for (const path of [
    "/",
    "/plan",
    "/guides",
    "/deals",
    "/guide",
    "/ui-states",
    "/checkout/" + id,
    "/tour/" + id,
    "/terms",
    "/guide-terms",
  ]) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200, path);
    const html = await r.text();
    assert.ok(html.includes('id="main"'), path);
    assert.ok(
      !html.includes("Private HTTP fixture"),
      path + " does not SSR private booking data",
    );
  }
  check(
    "public and client-shell routes render with a main landmark and no private fixture data",
  );
  for (const path of ["/admin/research", "/admin/guides", "/admin/payments"]) {
    const r = await fetch(base + path, { redirect: "manual" });
    assert.equal(r.status, 307, path);
    assert.ok(r.headers.get("location")?.includes("/auth/sign-in"));
  }
  check("staff page routes redirect anonymous visitors to sign-in");
  for (const path of [
    "admin/research",
    "admin/guides",
    "admin/commerce",
    "guide",
  ]) {
    assert.equal(
      (await fetch(base + "/api/platform/" + path)).status,
      401,
      path,
    );
  }
  check("private administration APIs reject anonymous requests");
  assert.equal((await fetch(base + "/api/platform/booking/" + id)).status, 403);
  const privateResponse = await fetch(base + "/api/platform/booking/" + id, {
    headers: { "X-Plan-Key": p.editToken },
  });
  assert.equal(privateResponse.status, 200);
  assert.ok(privateResponse.headers.get("cache-control")?.includes("no-store"));
  assert.equal(
    (await privateResponse.json()).request.guest.email,
    "private@example.test",
  );
  check("private capability is required and booking responses are not cached");
  const evil = await fetch(base + "/api/platform/trip/" + id, {
    method: "POST",
    headers: {
      Origin: "https://evil.example",
      "Content-Type": "application/json",
      "X-Plan-Key": p.editToken,
    },
    body: JSON.stringify({ action: "message", body: "Must not persist" }),
  });
  assert.equal(evil.status, 403);
  const valid = await fetch(base + "/api/platform/trip/" + id, {
    method: "POST",
    headers: {
      Origin: base,
      "Content-Type": "application/json",
      "X-Plan-Key": p.editToken,
    },
    body: JSON.stringify({
      action: "message",
      body: "HTTP test message",
      kind: "text",
    }),
  });
  assert.equal(valid.status, 200);
  assert.equal(
    Number(
      (
        await sql`SELECT count(*) AS total FROM hub_messages WHERE request_id=${id}`
      )[0].total,
    ),
    1,
  );
  check(
    "cross-origin writes are blocked while an authorized booking message persists",
  );
  for (const path of [
    "/api/bots/telegram",
    "/api/bots/whatsapp",
    "/api/jobs/platform",
  ]) {
    const r = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(r.status, 401, path);
  }
  check("bot and scheduler endpoints reject unauthenticated delivery");
  assert.equal(
    (
      await fetch(
        base + "/api/platform/trip/" + id + "/asset?asset=nonexistent",
        { headers: { "X-Plan-Key": p.editToken } },
      )
    ).status,
    404,
  );
  assert.equal(
    (await fetch(base + "/api/platform/trip/" + id + "/pdf")).status,
    403,
  );
  const pdf = await fetch(base + "/api/platform/trip/" + id + "/pdf", {
    headers: { "X-Plan-Key": p.editToken },
  });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 4)
      .toString(),
    "%PDF",
  );
  check(
    "private files enforce authorization and the offline download is a real PDF",
  );
  console.log(
    `HTTP/SSR checks: ${count} passed. No browser automation or provider messages were used.`,
  );
} finally {
  await sql`DELETE FROM hub_messages WHERE request_id=${id}`;
  await sql`DELETE FROM hub_requests WHERE id=${id}`;
  await sql`DELETE FROM hub_access_links WHERE plan_id=${p.id}`;
  await sql`DELETE FROM hub_plans WHERE id=${p.id}`;
  await sql`DELETE FROM hub_notifications WHERE id LIKE ${"%" + id + "%"}`;
  console.log("HTTP fixtures removed.");
}
