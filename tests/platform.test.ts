import test from "node:test";
import assert from "node:assert/strict";
import {
  robotsAllowed,
  researchURL,
  publicResearchAddress,
  extractOffers,
  queryFromMaps,
} from "../lib/platform/research";
import { quoteTerms, cancellationRefund } from "../lib/platform/commerce";
import {
  commerceDefaults,
  commerceSchema,
  guideSchema,
} from "../lib/platform/types";
import { tripWindow, matchScore } from "../lib/platform/guides";
import { planSchema } from "../lib/hub/types";
import { guideNet } from "../lib/platform/payouts";
import { verifyHmac, sameSecret } from "../lib/platform/bots";
import { redactDeep, contactUnlocked } from "../lib/platform/store";
import { createHmac } from "node:crypto";
test("research URL policy denies credentials, non-HTTPS and unapproved hosts", () => {
  assert.equal(
    researchURL("https://venue.kz/tickets", ["venue.kz"]).hostname,
    "venue.kz",
  );
  for (const u of [
    "http://venue.kz",
    "https://venue.kz.evil.test",
    "https://u:p@venue.kz",
    "https://venue.kz:444/",
    "https://127.0.0.1/",
    "https://venue.kz/?api_key=secret",
  ])
    assert.throws(() => researchURL(u, ["venue.kz", "127.0.0.1"]));
  for (const ip of [
    "127.0.0.1",
    "169.254.169.254",
    "10.1.2.3",
    "192.168.1.1",
    "::1",
    "168.63.129.16",
    "192.0.0.1",
    "198.51.100.3",
  ])
    assert.equal(publicResearchAddress(ip), false, ip);
  assert.equal(publicResearchAddress("1.1.1.1"), true);
});
test("robots longest matching rule wins and source-specific groups override wildcard", () => {
  const robots =
    "User-agent: *\nDisallow: /private\nAllow: /private/public\nDisallow: /*?token=*\n";
  assert.equal(robotsAllowed(robots, "/private/x"), false);
  assert.equal(robotsAllowed(robots, "/private/public/page"), true);
  assert.equal(robotsAllowed(robots, "/?token=abc"), false);
  assert.equal(
    robotsAllowed(
      "User-agent: *\nDisallow: /\nUser-agent: AlmatyGuideResearchBot\nAllow: /tickets",
      "/tickets",
    ),
    true,
  );
});
test("structured prices retain source confidence and never become owner-confirmed", () => {
  const html =
    '<script type="application/ld+json">' +
    JSON.stringify({
      "@type": "Product",
      offers: [
        {
          "@type": "Offer",
          name: "Adult per person",
          price: "3500",
          priceCurrency: "KZT",
        },
        {
          "@type": "AggregateOffer",
          lowPrice: "100",
          highPrice: "90",
          priceCurrency: "USD",
        },
        { "@type": "Offer", price: "", priceCurrency: "KZT" },
      ],
    }) +
    "</script>";
  const offers = extractOffers(html, "https://venue.kz/tickets");
  assert.equal(offers.length, 1);
  assert.equal(offers[0].price.min, 350000);
  assert.equal(offers[0].price.source, "estimated");
  assert.equal(offers[0].price.type, "per-person");
});
test("Maps names are parsed without following arbitrary short links", () => {
  assert.equal(
    queryFromMaps("https://www.google.com/maps/place/Medeu/").query,
    "Medeu",
  );
  assert.equal(queryFromMaps("https://maps.app.goo.gl/abc").query, "");
  assert.throws(() => queryFromMaps("https://evil.test/"));
});
test("tax-inclusive final totals remain exact and cancellation boundaries are deterministic", () => {
  const c = { ...commerceDefaults, taxBps: 1200, feeMinor: 1000 };
  const t = quoteTerms(113000, c, "KZT");
  assert.equal(t.subtotalMinor + t.taxMinor + t.feeMinor, 113000);
  assert.equal(t.taxMinor, 12000);
  const start = "2026-12-20T00:00:00+05:00",
    at = new Date(start).valueOf() - 48 * 3600000;
  assert.equal(cancellationRefund(10000, start, at, c), 10000);
  assert.equal(cancellationRefund(10000, start, at + 1, c), 0);
  assert.notEqual(
    quoteTerms(1, c, "KZT").version,
    quoteTerms(1, { ...c, freeCancellationHours: 24 }, "KZT").version,
  );
});
test("dynamic pricing cannot exceed owner bounds", () => {
  assert.equal(
    commerceSchema.safeParse({
      ...commerceDefaults,
      dynamicPricing: true,
      weekdayAdjustments: { 6: 26 },
    }).success,
    false,
  );
  assert.equal(
    commerceSchema.safeParse({
      ...commerceDefaults,
      weekdayAdjustments: { 6: 25, 1: -20 },
    }).success,
    true,
  );
});
test("guide matching uses preferred guide, language and exact planned work duration", () => {
  const p = planSchema.parse({
    startDate: "2026-12-20",
    adults: 2,
    days: [
      { stops: [{ id: "a", itemId: "medeu", start: "10:00", duration: 120 }] },
      {
        stops: [{ id: "b", itemId: "panfilov", start: "09:00", duration: 60 }],
      },
    ],
  });
  const w = tripWindow(p);
  assert.equal(w.hours, 3);
  assert.equal(w.start, "2026-12-20T05:00:00.000Z");
  const g = guideSchema.parse({
    id: "g",
    name: "Real Guide",
    email: "guide@example.test",
    languages: ["en"],
    specialties: ["history"],
    rateType: "tour",
    rateMinor: 10000,
  });
  assert.ok(matchScore(g, "en", ["history"], 5, "g") > 1000);
  assert.equal(guideNet(10001, 20), 8000);
});
test("contact gates and webhook signatures fail closed", () => {
  assert.equal(
    contactUnlocked({ paid_minor: 0, payment_status: "pay-on-arrival" }),
    false,
  );
  assert.equal(
    contactUnlocked({ paid_minor: 1, payment_status: "deposit-paid" }),
    true,
  );
  const v = redactDeep({
    message: "Call +7 777 123 45 67 or guide@example.com",
    stops: [{ note: "https://wa.me/77771234567" }],
  });
  assert.ok(!JSON.stringify(v).includes("guide@example.com"));
  assert.ok(!JSON.stringify(v).includes("77771234567"));
  const raw = '{"message":"hello"}',
    secret = "test-secret",
    signature =
      "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(verifyHmac(raw, signature, secret), true);
  assert.equal(verifyHmac(raw + "x", signature, secret), false);
  assert.equal(sameSecret("", ""), false);
});
