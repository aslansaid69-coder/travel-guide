/**
 * Exercises the real assistant loop (lib/assistant/run.ts) against a local fake of the
 * Messages streaming API, with real tool execution against the test database.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

type Body = { messages: { role: string; content: unknown }[]; tools?: { name: string; eager_input_streaming?: boolean }[]; system?: unknown };
const requests: Body[] = [];

function sse(res: import("node:http").ServerResponse, events: [string, unknown][]) {
  res.writeHead(200, { "content-type": "text/event-stream" });
  for (const [event, data] of events) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.end();
}
const start = (id: string) => ["message_start", { type: "message_start", message: { id, type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } }] as [string, unknown];
const stop = (reason: string) => [
  ["message_delta", { type: "message_delta", delta: { stop_reason: reason, stop_sequence: null }, usage: { output_tokens: 5 } }],
  ["message_stop", { type: "message_stop" }],
] as [string, unknown][];

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString()) as Body;
}

const server = createServer(async (req, res) => {
  const body = await readBody(req);
  requests.push(body);
  const last = body.messages[body.messages.length - 1];
  const hasToolResult = Array.isArray(last.content) && (last.content as { type: string }[]).some((b) => b.type === "tool_result");
  if (!hasToolResult) {
    // Turn 1: ask to run two tools in parallel.
    sse(res, [
      start("msg_1"),
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu_1", name: "estimate_tour", input: {} } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"placeIds":["kok-tobe","panfilov"],"adults":2}' } }],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["content_block_start", { type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "tu_2", name: "add_to_tour", input: {} } }],
      ["content_block_delta", { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"placeId":"kok-tobe"}' } }],
      ["content_block_stop", { type: "content_block_stop", index: 1 }],
      ...stop("tool_use"),
    ]);
    return;
  }
  // Turn 2: answer in text after reading the tool results.
  sse(res, [
    start("msg_2"),
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Ориентировочно " } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "от X до Y." } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ...stop("end_turn"),
  ]);
});

test("assistant streams text, runs tools server-side and emits add-to-tour actions", async () => {
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as AddressInfo).port;
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${port}`;
  const { runAssistant } = await import("../../lib/assistant/run");
  const { assistantSettingsSchema } = await import("../../lib/assistant/settings");
  const events = [];
  for await (const e of runAssistant({ history: [], userText: "Сколько стоит Кок-Тобе и парк?", lang: "ru", settings: assistantSettingsSchema.parse({}) }))
    events.push(e);
  server.close();
  const text = events.filter((e) => e.type === "text").map((e) => (e as { delta: string }).delta).join("");
  assert.equal(text, "Ориентировочно от X до Y.");
  assert.deepEqual(events.filter((e) => e.type === "tool").map((e) => (e as { name: string }).name), ["estimate_tour", "add_to_tour"]);
  const action = events.find((e) => e.type === "action") as { action: { placeId: string } } | undefined;
  assert.equal(action?.action.placeId, "kok-tobe");
  assert.equal(events.at(-1)?.type, "done");
  // Second request carried both tool results in ONE user message, with real data from our DB.
  const second = requests[1].messages.at(-1)!.content as { type: string; tool_use_id: string; content: string; is_error: boolean }[];
  assert.equal(second.length, 2);
  const estimate = JSON.parse(second.find((b) => b.tool_use_id === "tu_1")!.content);
  assert.match(estimate.approximateTotal, /₸/);
  assert.match(estimate.disclaimer, /Approximate/);
  assert.ok(requests[0].tools?.every((t) => t.eager_input_streaming === true));
  assert.match(JSON.stringify(requests[0].system), /Never invent places, prices/);
});

test("tool errors are returned to the model, not thrown", async () => {
  const { runTool } = await import("../../lib/assistant/tools");
  const ctx = { lang: "en" as const, actions: [] };
  const bad = await runTool("estimate_tour", { placeIds: [] }, ctx);
  assert.equal(bad.isError, true);
  const unknown = await runTool("add_to_tour", { placeId: "does-not-exist" }, ctx);
  assert.equal(unknown.isError, true);
  assert.equal(ctx.actions.length, 0);
  const search = await runTool("search_places", { query: "kok" }, ctx);
  assert.equal(search.isError, false);
  const rows = JSON.parse(search.content);
  assert.ok(rows.some((r: { id: string; entrancePrice: string }) => r.id === "kok-tobe" && /₸/.test(r.entrancePrice)));
  const nope = await runTool("drop_tables", {}, ctx);
  assert.equal(nope.isError, true);
});
