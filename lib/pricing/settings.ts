import { z } from "zod";

/** Owner-editable tariffs (Admin → Pricing). All money in minor units of `currency`. */
export const pricingSchema = z.object({
  currency: z.enum(["KZT", "USD", "EUR"]).default("KZT"),
  /** Vehicle tariff per km for one car/minivan (driver + fuel). */
  transportPerKmMinor: z.number().int().min(0).max(10_000_000).default(25000),
  /** Minimum transport charge per day (short city days). */
  transportMinPerDayMinor: z.number().int().min(0).max(100_000_000).default(1500000),
  /** Seats per vehicle; larger groups need more vehicles. */
  vehicleCapacity: z.number().int().min(1).max(60).default(6),
  /** Straight-line distance × road factor approximates road distance when no router is configured. */
  roadFactor: z.number().min(1).max(3).default(1.35),
  /** Average door-to-door speed for drive-time estimates (km/h). */
  averageSpeedKmh: z.number().min(5).max(120).default(55),
  /** Upper bound adds this % to transport for traffic, detours and waiting time. */
  transportBufferPercent: z.number().min(0).max(100).default(20),
  /** Touring hours per day used to work out the number of days. */
  hoursPerDay: z.number().min(3).max(16).default(9),
  /** Guide day rate used when no guide is chosen and no active guides exist yet. */
  fallbackGuideDayMinor: z.number().int().min(0).max(100_000_000).default(3500000),
  /** Service commission, % of tickets + transport + guide. */
  commissionPercent: z.number().min(0).max(50).default(10),
  /** Share of the estimate's upper bound charged online when booking. */
  depositPercent: z.number().int().min(1).max(100).default(30),
  /** Default start/end point of each day (hotel area / city centre). */
  startLat: z.number().min(-90).max(90).default(43.2389),
  startLng: z.number().min(-180).max(180).default(76.8897),
  startLabel: z.string().trim().max(120).default("Almaty city centre"),
  /** Children pay the child ticket price when published, otherwise this % of the adult price. */
  childTicketPercent: z.number().min(0).max(100).default(100),
  maxPlaces: z.number().int().min(1).max(12).default(6),
});
export type PricingSettings = z.infer<typeof pricingSchema>;
export const defaultPricing: PricingSettings = pricingSchema.parse({});
