import { z } from "zod";
import {
  currencySchema,
  itemSchema,
  planSchema,
  priceSchema,
} from "@/lib/hub/types";
const text = (max: number) => z.string().trim().max(max);
export const specialties = [
  "hiking",
  "history",
  "food",
  "photography",
  "family",
  "vip",
] as const;
export const guideSchema = z.object({
  id: text(120).regex(/^[a-zA-Z0-9_-]+$/),
  name: text(140).min(2),
  email: z.email().max(254),
  phone: text(50).default(""),
  photo: text(800).default(""),
  bio: text(1800).default(""),
  bioRu: text(1800).default(""),
  languages: z
    .array(z.enum(["en", "ru", "kk", "zh", "de", "fr", "tr", "es"]))
    .min(1)
    .max(8),
  specialties: z.array(z.enum(specialties)).max(6),
  areas: z.array(text(100)).max(15).default(["Almaty"]),
  certifications: z.array(text(200)).max(15).default([]),
  rateType: z.enum(["hour", "tour"]),
  rateMinor: z.number().int().min(0).max(100000000),
  currency: currencySchema.default("KZT"),
  commissionPercent: z.number().min(0).max(60).default(20),
  country: text(2)
    .regex(/^[A-Z]{2}$/)
    .default("KZ"),
  status: z.enum(["draft", "active", "paused", "removed"]).default("draft"),
});
export type Guide = z.infer<typeof guideSchema>;
export const commerceSchema = z
  .object({
    taxBps: z.number().int().min(0).max(3000).default(0),
    taxLabel: text(120).default("Tax"),
    feeMinor: z.number().int().min(0).max(10000000).default(0),
    freeCancellationHours: z.number().int().min(0).max(720).default(48),
    lateRefundPercent: z.number().min(0).max(100).default(0),
    payoutDelayHours: z.number().int().min(0).max(720).default(24),
    referralRewardMinor: z.number().int().min(0).max(1000000).default(100000),
    returningDiscountPercent: z.number().min(0).max(30).default(5),
    invoicePrefix: text(16)
      .regex(/^[A-Za-z0-9-]+$/)
      .default("ALM"),
    operatorTaxId: text(100).default(""),
    clientTerms: text(12000).default(
      "Your itinerary is a request until the team confirms availability. Review the final quote, inclusions, cancellation window and payment currency before accepting. Contact the team for changes. Weather alternatives require agreement.",
    ),
    guideTerms: text(12000).default(
      "Guides accept only trips they are qualified and available to lead. Keep client data private, communicate through the booking thread and report safety issues promptly. Completion must be approved by the manager. Earnings, commission, refunds and payout eligibility follow the accepted assignment.",
    ),
    maxPeakPercent: z.number().min(0).max(100).default(25),
    maxSlowDiscount: z.number().min(0).max(50).default(20),
    weekdayAdjustments: z
      .record(z.string(), z.number().min(-50).max(100))
      .default({}),
    dynamicPricing: z.boolean().default(false),
    ownerDigest: z.boolean().default(true),
  })
  .refine(
    (c) =>
      Object.values(c.weekdayAdjustments).every(
        (v) => v <= c.maxPeakPercent && v >= -c.maxSlowDiscount,
      ),
    "Weekday price change exceeds owner limits",
  );
export type CommerceSettings = z.infer<typeof commerceSchema>;
export const commerceDefaults = commerceSchema.parse({});
export type Evidence = {
  source: string;
  url: string;
  checkedAt: string;
  confidence: number;
  licence?: string;
  persistence: "licensed" | "owner" | "live-only";
  note?: string;
};
export type ResearchField = { value: unknown; evidence: Evidence };
export type ResearchDraft = {
  id: string;
  query: string;
  item: Partial<z.infer<typeof itemSchema>>;
  fields: Record<string, ResearchField>;
  googlePlaceId?: string;
  price?: z.infer<typeof priceSchema> | null;
  warnings: string[];
  status: "pending" | "published" | "hidden";
  createdAt: string;
};
export const quoteInputSchema = z.object({
  requestId: text(120),
  plan: planSchema,
  version: z.number().int().positive(),
  subtotalMinor: z.number().int().min(0).max(10000000000),
  currency: currencySchema,
  depositPercent: z.number().int().min(1).max(100),
  terms: text(10000).min(10),
});
export const codeSchema = z
  .object({
    code: text(64).regex(/^[A-Z0-9-]{5,64}$/),
    kind: z.enum(["promo", "voucher", "referral", "loyalty"]),
    percent: z.number().min(0).max(80).default(0),
    amountMinor: z.number().int().min(0).max(100000000),
    currency: currencySchema.default("KZT"),
    maxUses: z.number().int().min(1).max(100000).default(1),
    minimumMinor: z.number().int().min(0).default(0),
    customerId: text(100).default(""),
    startsAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    active: z.boolean().default(true),
  })
  .refine(
    (v) => new Date(v.expiresAt) > new Date(v.startsAt),
    "Expiry must be after start",
  );
export const messageSchema = z.object({
  body: text(4000).default(""),
  kind: z.enum(["text", "location", "photo"]).default("text"),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  assetId: text(120).optional(),
  language: z.enum(["en", "ru"]).default("en"),
});
