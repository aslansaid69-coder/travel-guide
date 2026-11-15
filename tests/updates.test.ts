import test from "node:test";
import assert from "node:assert/strict";
import { runAdapters, updateRunKey } from "../lib/updates/engine";
import { sendAlert } from "../lib/updates/alerts";
import { allowedWorkflow } from "../lib/cameras/scheduler-auth";
import type { Adapter, SourceResult } from "../lib/updates/types";
test("one failing provider does not prevent the other source from refreshing; failed data cannot replace last good", async () => {
  const saved: Record<string, SourceResult> = {};
  const lastGood = { weather: { temperature: 17 } };
  const adapters: Adapter[] = [
    {
      key: "weather",
      kind: "weather",
      label: "Weather",
      load: async () => {
        throw new Error("Weather provider returned HTTP 503.");
      },
    },
    {
      key: "events",
      kind: "events",
      label: "Events",
      load: async () => ({
        status: "success",
        data: ["approved"],
        reason: "Imported",
        requests: 0,
      }),
    },
  ];
  await runAdapters(adapters, async (a, r) => {
    saved[a.key] = r;
    if (r.status === "success" && a.key === "weather")
      lastGood.weather = r.data as { temperature: number };
  });
  assert.equal(saved.weather.status, "failed");
  assert.equal(saved.weather.data, undefined);
  assert.equal(lastGood.weather.temperature, 17);
  assert.equal(saved.events.status, "success");
});
test("unexpected source exceptions do not leak API credentials into logs", async () => {
  let message = "";
  await runAdapters(
    [
      {
        key: "test",
        kind: "prices",
        label: "Test",
        load: async () => {
          throw new Error("https://example.com/?apikey=SECRET");
        },
      },
    ],
    async (_a, r) => {
      message = r.reason;
    },
  );
  assert.equal(message.includes("SECRET"), false);
});
test("email alert uses the configured recipient and stable provider idempotency key without sending mail", async () => {
  const old = { ...process.env };
  Object.assign(process.env, {
    RESEND_API_KEY: "fake-test-key",
    ALERT_FROM: "guide@example.com",
    ALERT_TO: "owner@example.com",
  });
  let body: Record<string, unknown> = {},
    id = "";
  const fake = (async (_u, init) => {
    body = JSON.parse(String(init?.body));
    id = new Headers(init?.headers).get("Idempotency-Key") || "";
    return Response.json({ id: "mock" });
  }) as typeof fetch;
  try {
    await sendAlert(
      { id: "daily:test", subject: "Test", body: "Last good retained" },
      fake,
    );
    assert.deepEqual(body.to, ["owner@example.com"]);
    assert.equal(id, "daily:test");
  } finally {
    for (const k of ["RESEND_API_KEY", "ALERT_FROM", "ALERT_TO"]) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
  }
});
test("daily scheduler trust cannot be used by the camera workflow or a pull request", () => {
  const p = {
    repository_id: "1458725366",
    repository_owner_id: "354138630",
    repository: "aslansaid69-coder/travel-guide",
    ref: "refs/heads/main",
    workflow_ref:
      "aslansaid69-coder/travel-guide/.github/workflows/daily-updates.yml@refs/heads/main",
    event_name: "schedule",
  };
  assert.equal(allowedWorkflow(p, "daily"), true);
  assert.equal(allowedWorkflow(p, "cameras"), false);
  assert.equal(
    allowedWorkflow({ ...p, event_name: "pull_request" }, "daily"),
    false,
  );
});

test("daily run IDs follow Almaty midnight and manual checks do not consume the scheduled run", () => {
  const time = new Date("2026-11-15T20:00:00Z");
  assert.equal(updateRunKey("daily", time), "daily:2026-11-16");
  assert.notEqual(
    updateRunKey("daily", time, true),
    updateRunKey("daily", time),
  );
  assert.equal(
    updateRunKey("daily", time, true),
    updateRunKey("daily", new Date(time.valueOf() + 1000), true),
  );
});
