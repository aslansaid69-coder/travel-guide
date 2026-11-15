import test from "node:test";
import assert from "node:assert/strict";
import { validateContact } from "../lib/contact";
import { POST } from "../app/api/contact/route";
const valid = {
  name: "Alex Visitor",
  email: "alex@example.com",
  message: "I would like to know more about Almaty.",
  website: "",
};
function req(body: unknown, origin = "http://localhost:3000") {
  return new Request("http://localhost:3000/api/contact", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
test("contact validation rejects invalid email, short messages, and header injection", () => {
  assert.ok(validateContact(valid));
  for (const patch of [
    { email: "invalid" },
    { message: "short" },
    { name: "name\nInjected" },
  ])
    assert.equal(validateContact({ ...valid, ...patch }), null);
});
test("contact endpoint rejects cross-origin submissions", async () => {
  assert.equal((await POST(req(valid, "https://example.com"))).status, 403);
});
test("missing mail credentials returns an honest unavailable response", async () => {
  const old = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try {
    assert.equal((await POST(req(valid))).status, 503);
  } finally {
    if (old) process.env.RESEND_API_KEY = old;
  }
});
test("successful provider response delivers expected reply-to and recipient contract without sending mail", async () => {
  const oldFetch = globalThis.fetch,
    oldEnv = { ...process.env };
  process.env.RESEND_API_KEY = "test-only";
  process.env.CONTACT_FROM = "guide@example.com";
  process.env.CONTACT_TO = "owner@example.com";
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_url, init) => {
    sent = JSON.parse(init?.body as string);
    return Response.json({ id: "mock-email" });
  }) as typeof fetch;
  try {
    assert.equal((await POST(req(valid))).status, 200);
    assert.equal(sent.reply_to, valid.email);
    assert.deepEqual(sent.to, ["owner@example.com"]);
  } finally {
    globalThis.fetch = oldFetch;
    for (const key of ["RESEND_API_KEY", "CONTACT_FROM", "CONTACT_TO"]) {
      if (oldEnv[key] === undefined) delete process.env[key];
      else process.env[key] = oldEnv[key];
    }
  }
});

test("public Host is respected when Next.js exposes an internal request URL", async () => {
  const request = new Request("http://localhost:3000/api/contact", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:3000",
      host: "127.0.0.1:3000",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...valid, website: "honeypot" }),
  });
  assert.equal((await POST(request)).status, 200);
});
