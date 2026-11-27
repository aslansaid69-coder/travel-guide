import test from "node:test";
import assert from "node:assert/strict";
import { BOOKING_STATUSES, canTransition, nextStatuses, transitionActor } from "../lib/tours/status";

test("happy path pending → paid → confirmed → completed", () => {
  assert.ok(canTransition("pending", "paid"));
  assert.ok(canTransition("paid", "confirmed"));
  assert.ok(canTransition("confirmed", "completed"));
});

test("no skipping payment, no going backwards, terminal refunded", () => {
  assert.equal(canTransition("pending", "confirmed"), false);
  assert.equal(canTransition("pending", "completed"), false);
  assert.equal(canTransition("confirmed", "paid"), false);
  assert.equal(canTransition("completed", "confirmed"), false);
  assert.deepEqual(nextStatuses("refunded"), []);
  for (const s of BOOKING_STATUSES) assert.equal(canTransition(s, s), false, s);
});

test("cancellation and refunds", () => {
  assert.ok(canTransition("pending", "cancelled"));
  assert.ok(canTransition("paid", "refunded"));
  assert.ok(canTransition("cancelled", "refunded"));
  assert.equal(canTransition("completed", "cancelled"), false);
  assert.equal(canTransition("pending", "refunded"), false, "nothing to refund before payment");
});

test("only webhooks can mark a booking paid", () => {
  assert.equal(transitionActor("paid"), "webhook");
  assert.equal(transitionActor("confirmed"), "staff");
  assert.equal(transitionActor("cancelled"), "staff-or-owner-of-booking");
});
