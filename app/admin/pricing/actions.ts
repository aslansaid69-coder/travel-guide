"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { back, failure, formObject, isRedirect } from "@/lib/admin/form";
import { database } from "@/lib/db";
import { pricingSchema } from "@/lib/pricing/settings";

const money = z.coerce.number().min(0).max(1_000_000).transform((v) => Math.round(v * 100));
const form = z.object({
  currency: z.enum(["KZT", "USD", "EUR"]),
  transportPerKm: money,
  transportMinPerDay: money,
  fallbackGuideDay: money,
  vehicleCapacity: z.coerce.number().int(),
  roadFactor: z.coerce.number(),
  averageSpeedKmh: z.coerce.number(),
  transportBufferPercent: z.coerce.number(),
  hoursPerDay: z.coerce.number(),
  commissionPercent: z.coerce.number(),
  depositPercent: z.coerce.number().int(),
  childTicketPercent: z.coerce.number(),
  maxPlaces: z.coerce.number().int(),
  startLat: z.coerce.number(),
  startLng: z.coerce.number(),
  startLabel: z.string(),
});

export async function savePricing(formData: FormData) {
  try {
    const actor = await authorize("pricing.manage");
    const f = form.parse(formObject(formData));
    const data = pricingSchema.parse({
      currency: f.currency,
      transportPerKmMinor: f.transportPerKm,
      transportMinPerDayMinor: f.transportMinPerDay,
      fallbackGuideDayMinor: f.fallbackGuideDay,
      vehicleCapacity: f.vehicleCapacity,
      roadFactor: f.roadFactor,
      averageSpeedKmh: f.averageSpeedKmh,
      transportBufferPercent: f.transportBufferPercent,
      hoursPerDay: f.hoursPerDay,
      commissionPercent: f.commissionPercent,
      depositPercent: f.depositPercent,
      childTicketPercent: f.childTicketPercent,
      maxPlaces: f.maxPlaces,
      startLat: f.startLat,
      startLng: f.startLng,
      startLabel: f.startLabel,
    });
    await database()`INSERT INTO app_settings(key,data,updated_by) VALUES('pricing',${JSON.stringify(data)}::jsonb,${actor.id}) ON CONFLICT(key) DO UPDATE SET data=EXCLUDED.data,updated_at=now(),updated_by=EXCLUDED.updated_by`;
    await recordAudit(actor, "settings.pricing", "pricing", data);
    revalidatePath("/build");
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/admin/pricing", failure(error), "bad");
  }
  back("/admin/pricing", "Pricing saved. New estimates use it immediately; existing bookings keep their snapshot.");
}
