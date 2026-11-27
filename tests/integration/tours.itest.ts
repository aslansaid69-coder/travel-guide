import test from "node:test";
import assert from "node:assert/strict";
import { database } from "../../lib/db";
import { createBooking, getBooking, quoteTour } from "../../lib/tours/service";
import { applyPaymentEvent, transition } from "../../lib/tours/payments";
import { eligibleTrip, moderateReview, approvedReviews, submitReview } from "../../lib/reviews/store";

const sql = database();
const user = { id: "it-user-1", email: "traveller@example.com" };
const guideData = {
  id: "it-guide-1",
  name: "Aigerim Test",
  email: "aigerim@example.com",
  languages: ["en", "ru", "kk"],
  specialties: ["history"],
  areas: ["Almaty", "Almaty Region"],
  rateType: "day",
  rateMinor: 4000000,
  currency: "KZT",
  experienceYears: 8,
  status: "active",
};
const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

test.before(async () => {
  await sql`DELETE FROM place_reviews WHERE user_id=${user.id}`;
  await sql`DELETE FROM payment_events WHERE event_id LIKE 'it-%'`;
  await sql`DELETE FROM tour_payments WHERE booking_id IN (SELECT id FROM tour_bookings WHERE user_id=${user.id})`;
  await sql`DELETE FROM tour_bookings WHERE user_id=${user.id}`;
  await sql`DELETE FROM guides WHERE id=${guideData.id}`;
  await sql`INSERT INTO guides(id,data,status) VALUES(${guideData.id},${JSON.stringify(guideData)}::jsonb,'active')`;
});

test("quote uses researched prices, the guide market and lists matching guides", async () => {
  const q = await quoteTour({ placeIds: ["kok-tobe", "panfilov", "green-bazaar"], adults: 2, children: 1, language: "en", startDate: future(10) });
  const tickets = q.estimate.lines.find((l) => l.key === "tickets")!;
  // Kok-Tobe 6,000–10,000 ₸ per adult, child 3,000 ₸; the others are free.
  assert.equal(tickets.min, 2 * 600000 + 300000);
  assert.equal(tickets.max, 2 * 1000000 + 300000);
  assert.ok(q.matches?.some((m) => m.guide.id === guideData.id));
  assert.equal(q.estimate.unpricedPlaces.length, 0);
  assert.ok(q.estimate.total.max >= q.estimate.total.min);
});

test("booking re-quotes on the server, holds the guide and blocks double booking", async () => {
  const start = future(12);
  const { id, quote } = await createBooking(user, {
    placeIds: ["kok-tobe", "panfilov"],
    adults: 2,
    children: 0,
    startDate: start,
    guideId: guideData.id,
    language: "en",
    name: "Test Traveller",
    phone: "+7 700 000 0000",
    acceptTerms: true,
  });
  const b = (await getBooking(id))!;
  assert.equal(b.status, "pending");
  assert.equal(b.amount_due_minor, quote.estimate.depositMinor);
  assert.equal(b.estimate.lines.find((l) => l.key === "guide")!.min, 4000000 * b.days);
  await assert.rejects(
    createBooking({ id: "it-user-2", email: "x@example.com" }, {
      placeIds: ["panfilov"], adults: 1, startDate: start, guideId: guideData.id, language: "en", name: "Other", phone: "12345", acceptTerms: true,
    }),
    /no longer free/,
  );
  await assert.rejects(
    createBooking(user, { placeIds: ["panfilov"], adults: 1, startDate: future(20), guideId: guideData.id, language: "en", name: "T", phone: "12345", acceptTerms: false }),
  );
});

test("payment events are verified against the session, applied once, and drive statuses", async () => {
  const b = (await sql`SELECT id,amount_due_minor,currency FROM tour_bookings WHERE user_id=${user.id} ORDER BY created_at DESC LIMIT 1`)[0];
  const id = String(b.id);
  await sql`INSERT INTO tour_payments(id,booking_id,provider,provider_session_id,amount_minor,currency) VALUES('it-pay-1',${id},'stripe','cs_it_1',${b.amount_due_minor},${b.currency})`;
  const wrong = await applyPaymentEvent("stripe", { kind: "paid", eventId: "it-ev-0", bookingId: id, sessionId: "cs_it_1", paymentId: "pi_1", amountMinor: 1, currency: "KZT", livemode: false });
  assert.equal(wrong, "mismatch");
  assert.equal((await getBooking(id))!.status, "pending", "a mismatched amount never marks a booking paid");
  await sql`UPDATE tour_payments SET status='created' WHERE id='it-pay-1'`;
  const ev = { kind: "paid" as const, eventId: "it-ev-1", bookingId: id, sessionId: "cs_it_1", paymentId: "pi_1", amountMinor: Number(b.amount_due_minor), currency: "KZT", livemode: false };
  assert.equal(await applyPaymentEvent("stripe", ev), "paid");
  assert.equal(await applyPaymentEvent("stripe", ev), "duplicate");
  const paid = (await getBooking(id))!;
  assert.equal(paid.status, "paid");
  assert.equal(paid.paid_minor, Number(b.amount_due_minor), "paid once despite the duplicate event");
  assert.equal(await transition(id, "completed", "staff"), null, "cannot skip confirmation");
  assert.equal(await transition(id, "confirmed", "staff"), "paid");
  assert.equal(await transition(id, "completed", "staff"), "confirmed");
  const events = await sql`SELECT from_status,to_status FROM tour_booking_events WHERE booking_id=${id} ORDER BY id`;
  assert.deepEqual(events.map((e) => e.to_status).filter((s, i, a) => s !== a[i - 1]), ["pending", "paid", "confirmed", "completed"]);
});

test("only travellers with a completed trip can review; reviews need moderation", async () => {
  assert.equal(await eligibleTrip(user.id, "shymbulak"), null, "place not in the trip");
  assert.equal(await eligibleTrip("someone-else", "kok-tobe"), null);
  const ref = await eligibleTrip(user.id, "kok-tobe");
  assert.match(ref!, /^tour:tb_/);
  await assert.rejects(submitReview(user, { placeId: "shymbulak", rating: 5, body: "x".repeat(30), authorName: "T T" }), /completed trip/);
  const id = await submitReview(user, { placeId: "kok-tobe", rating: 5, body: "Wonderful views over the city at sunset.", authorName: "Test T" });
  assert.equal(await eligibleTrip(user.id, "kok-tobe"), null, "one review per trip and place");
  assert.equal((await approvedReviews("kok-tobe")).reviews.some((r) => r.id === id), false, "pending reviews are hidden");
  await moderateReview({ id, status: "approved" }, "it-admin");
  const pub = await approvedReviews("kok-tobe");
  assert.ok(pub.reviews.some((r) => r.id === id && r.verified));
  assert.equal(pub.average, 5);
});
