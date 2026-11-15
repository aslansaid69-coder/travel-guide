import assert from "node:assert/strict";
import { database } from "../lib/db";
if (process.env.INTEGRATION_BRANCH !== "stage-2-updates-test")
  throw new Error("Use the isolated branch.");
const base = "http://127.0.0.1:3015",
  sql = database();
let planId = "",
  requestId = "";
const call = (path: string, data?: unknown, key?: string, origin = base) =>
  fetch(base + path, {
    method: data ? "POST" : "GET",
    headers: {
      ...(data ? { "Content-Type": "application/json", Origin: origin } : {}),
      ...(key ? { "X-Plan-Key": key } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });
try {
  for (const path of [
    "/",
    "/explore",
    "/plan",
    "/emergency",
    "/privacy",
    "/manifest.webmanifest",
    "/sitemap.xml",
  ]) {
    const r = await call(path);
    assert.equal(r.status, 200, path);
  }
  const admin = await call("/api/hub/admin");
  assert.equal(admin.status, 401);
  const c = await (await call("/api/hub/catalog")).json();
  assert(c.items.length >= 7);
  assert(c.items.every((i: any) => i.status === "approved"));
  assert(!JSON.stringify(c).includes("edit_hash"));
  const plan = {
    title: "HTTP integration plan",
    startDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
    adults: 2,
    children: 0,
    interests: ["park"],
    budget: "balanced",
    currency: "KZT",
    days: [
      {
        stops: [
          {
            id: "s",
            itemId: "panfilov",
            start: "10:00",
            duration: 60,
            note: "",
          },
        ],
      },
    ],
  };
  const saved = await (await call("/api/hub/plans", { plan })).json();
  assert(saved.editToken);
  planId = saved.id;
  assert.equal(
    (
      await call(
        `/api/hub/plans/${planId}`,
        { action: "save", plan, version: 1 },
        "wrong-key",
      )
    ).status,
    403,
  );
  const data = await (await call(`/api/hub/plans/${planId}`)).json();
  assert.deepEqual(Object.keys(data).sort(), ["data", "id", "version"]);
  const booking = await call(
    `/api/hub/plans/${planId}`,
    {
      action: "request",
      guest: {
        name: "HTTP integration",
        email: "http-integration@example.com",
      },
      idempotencyKey: crypto.randomUUID(),
    },
    saved.editToken,
  );
  const b = await booking.json();
  assert.equal(booking.status, 201, JSON.stringify(b));
  requestId = b.id;
  assert.equal((await call(`/api/hub/requests/${requestId}`)).status, 403);
  const detail = await (
    await call(`/api/hub/requests/${requestId}`, undefined, saved.editToken)
  ).json();
  assert.equal(detail.request.status, "new");
  assert.equal(detail.messages.length, 1);
  const pdf = await call(`/api/hub/plans/${planId}/pdf`);
  assert.equal(pdf.status, 200);
  assert.equal(
    Buffer.from(await pdf.arrayBuffer())
      .subarray(0, 4)
      .toString(),
    "%PDF",
  );
  const csrf = await call(
    "/api/hub/plans",
    { plan },
    undefined,
    "https://other.example",
  );
  assert.equal(csrf.status, 403);
  assert.equal((await call("/api/jobs/daily", {})).status, 401);
  console.log(
    "HTTP smoke passed: pages, catalog, save/share, private request thread, PDF, CSRF and unauthorised admin/job guards.",
  );
} finally {
  if (requestId) {
    await sql`DELETE FROM hub_notifications WHERE id IN (${`request:${requestId}`},${`manager:${requestId}`},${`telegram:${requestId}`})`;
    await sql`DELETE FROM hub_messages WHERE request_id=${requestId}`;
    await sql`DELETE FROM hub_requests WHERE id=${requestId}`;
  }
  if (planId) {
    await sql`DELETE FROM hub_access_links WHERE plan_id=${planId}`;
    await sql`DELETE FROM hub_plans WHERE id=${planId}`;
  }
}
