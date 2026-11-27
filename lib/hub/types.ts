import { z } from "zod";
export const currencySchema = z.enum(["KZT", "USD", "EUR", "RUB", "GBP"]);
const text = (max: number) => z.string().trim().max(max);
export const priceSchema = z
  .object({
    type: z.enum(["free", "fixed", "per-person", "per-group", "range"]),
    min: z.number().int().min(0).max(100000000),
    max: z.number().int().min(0).max(100000000),
    child: z.number().int().min(0).optional(),
    currency: currencySchema.default("KZT"),
    source: z.enum(["owner-confirmed", "auto-detected", "estimated"]),
    updatedAt: text(40),
    note: text(300).default(""),
  })
  .refine((p) => p.max >= p.min, "Maximum must be at least minimum")
  .refine(
    (p) =>
      p.type !== "free" ||
      (p.min === 0 && p.max === 0 && (!p.child || p.child === 0)),
    "Free prices must be zero",
  );
export type Price = z.infer<typeof priceSchema>;
export const menuItemSchema = z.object({
  id: text(100).min(1),
  name: text(160).min(1),
  description: text(800).default(""),
  price: z.number().int().min(0).max(100000000),
  tags: z
    .array(z.enum(["vegetarian", "vegan", "halal", "gluten-free"]))
    .max(4)
    .default([]),
  photo: text(800).default(""),
});
export type MenuItem = z.infer<typeof menuItemSchema>;
export const itemSchema = z.object({
  id: text(120).regex(/^[a-zA-Z0-9_:-]+$/),
  name: text(180).min(1),
  nameRu: text(180).default(""),
  label: text(180).default(""),
  season: text(250).default(""),
  transport: text(1000).default(""),
  description: text(1800).default(""),
  descriptionRu: text(1800).default(""),
  category: z.enum([
    "mountains",
    "viewpoint",
    "park",
    "museum",
    "market",
    "restaurant",
    "cafe",
    "shop",
    "activity",
    "transfer",
    "rental",
    "beach",
  ]),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  image: text(800).default(""),
  alt: text(300).default(""),
  outdoor: z.boolean().default(true),
  duration: z.number().int().min(15).max(1440).default(90),
  hours: text(400).default(""),
  schedule: z
    .record(
      z.string(),
      z.array(
        z.tuple([
          text(5).regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          text(5).regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        ]),
      ),
    )
    .default({}),
  rating: z.number().min(0).max(5).nullable().default(null),
  reviews: z.number().int().min(0).default(0),
  price: priceSchema.nullable().default(null),
  menu: z.array(menuItemSchema).max(300).default([]),
  menuCurrency: currencySchema.default("KZT"),
  menuUpdatedAt: text(40).default(""),
  phone: text(100).default(""),
  website: text(800).default(""),
  sourceUrl: text(800).default(""),
  source: text(200).default("Owner"),
  googlePlaceId: text(220).default(""),
  osmId: text(100).default(""),
  closed: z.boolean().default(false),
  bookable: z.boolean().default(false),
  sort: z.number().int().min(-10000).max(10000).default(0),
  status: z.enum(["approved", "pending", "hidden"]).default("pending"),
  verifiedAt: text(40).default(""),
  address: text(500).default(""),
  accessibility: text(1000).default(""),
  imageCredit: z
    .object({
      author: text(500),
      sourceUrl: text(800),
      licence: text(200),
      licenceUrl: text(800),
    })
    .optional(),
  researchEvidence: z.record(z.string(), z.unknown()).optional(),
  serviceDepositPercent: z.number().int().min(1).max(100).optional(),
});
export type CatalogItem = z.infer<typeof itemSchema>;
export const stopSchema = z.object({
  id: text(100).min(1),
  itemId: text(120),
  start: text(5).regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  duration: z.number().int().min(15).max(1440),
  slotId: text(100).optional(),
  note: text(500).default(""),
});
export type Stop = z.infer<typeof stopSchema>;
export const planSchema = z
  .object({
    title: text(120).min(1).default("My Almaty escape"),
    startDate: text(10)
      .regex(/^20\d{2}-\d{2}-\d{2}$/)
      .refine(
        (v) =>
          !Number.isNaN(new Date(v).valueOf()) &&
          new Date(v).toISOString().slice(0, 10) === v,
        "Invalid calendar date",
      ),
    adults: z.number().int().min(1).max(50),
    children: z.number().int().min(0).max(30).default(0),
    interests: z.array(text(50)).max(10).default([]),
    budget: z.enum(["easy", "balanced", "premium"]).default("balanced"),
    currency: currencySchema.default("KZT"),
    preferredGuideId: text(120).optional(),
    days: z
      .array(z.object({ stops: z.array(stopSchema).max(25) }))
      .min(1)
      .max(14),
  })
  .refine((p) => {
    const ids = p.days.flatMap((d) => d.stops.map((s) => s.id));
    return new Set(ids).size === ids.length;
  }, "Stop IDs must be unique");
export type Plan = z.infer<typeof planSchema>;
export const contactSchema = z.object({
  name: text(120).min(2),
  email: z.email().max(254),
  phone: text(60).default(""),
  language: z.enum(["en", "ru"]).default("en"),
  allergies: text(500).default(""),
  accessibility: text(500).default(""),
  message: text(2000).default(""),
  reminderConsent: z.boolean().default(false),
  marketingConsent: z.boolean().default(false),
  messageConsent: z.boolean().default(false),
});
export type Guest = z.infer<typeof contactSchema>;
export const settingsSchema = z.object({
  markup: z.number().min(-50).max(100).default(0),
  groupThreshold: z.number().int().min(2).max(50).default(8),
  groupDiscount: z.number().min(0).max(50).default(0),
  seasonal: z
    .array(
      z.object({
        from: text(10).regex(/^\d{4}-\d{2}-\d{2}$/),
        to: text(10).regex(/^\d{4}-\d{2}-\d{2}$/),
        percent: z.number().min(-50).max(100),
      }),
    )
    .max(20)
    .default([]),
  weekdayAdjustments: z
    .record(z.string(), z.number().min(-50).max(100))
    .default({}),
  transportBase: z.number().int().min(0).max(1000000).default(0),
  transportPerKm: z.number().int().min(0).max(100000).default(0),
  transportConfirmed: z.boolean().default(false),
  vehicleCapacity: z.number().int().min(1).max(50).default(4),
  depositPercent: z.number().int().min(1).max(100).default(30),
  payOnArrival: z.boolean().default(true),
  autoPublish: z.boolean().default(false),
  assignment: z.enum(["round-robin", "language"]).default("round-robin"),
  discoveryEnabled: z.boolean().default(true),
  hideClosed: z.boolean().default(false),
  welcomeEn: text(500).default(
    "Build a day around what you love, check the weather, and let our team help with the details.",
  ),
  welcomeRu: text(500).default(
    "Соберите маршрут из любимых мест, проверьте погоду и попросите нашу команду помочь с деталями.",
  ),
  operatorName: text(180).default(""),
  operatorAddress: text(400).default(""),
  policy: text(3000).default(
    "Bookings are requests until confirmed by our team. Cancellation and refund terms are included in your final quote.",
  ),
  returnDiscount: text(80).default(""),
  dailyHour: z.number().int().min(0).max(23).default(5),
});
export type HubSettings = z.infer<typeof settingsSchema>;
export const defaultSettings = settingsSchema.parse({});
export type Rates = {
  date: string;
  source: string;
  rates: Record<string, number>;
}; // currency units per KZT
export type Staff = {
  id: string;
  email: string;
  role: "owner" | "admin" | "partner" | "guide";
  restaurantIds: string[];
  languages: string[];
};
export const stages = [
  "new",
  "contacted",
  "quote-sent",
  "confirmed",
  "completed",
  "cancelled",
] as const;
export type RequestStatus = (typeof stages)[number];
