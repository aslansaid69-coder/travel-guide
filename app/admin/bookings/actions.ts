"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { back, failure, isRedirect, parseForm } from "@/lib/admin/form";
import { refundBooking, transition } from "@/lib/tours/payments";
import { HttpError } from "@/lib/hub/security";

const statusForm = z.object({
  id: z.string().regex(/^tb_[a-z0-9]{8,40}$/),
  to: z.enum(["confirmed", "completed", "cancelled"]),
  note: z.string().trim().max(500).default(""),
});

export async function changeBookingStatus(formData: FormData) {
  const id = String(formData.get("id") || "");
  const path = `/admin/bookings/${encodeURIComponent(id)}`;
  try {
    const actor = await authorize("bookings.manage");
    const f = parseForm(statusForm, formData);
    const prev = await transition(f.id, f.to, actor.id, f.note || `Set to ${f.to} by staff`);
    if (!prev) throw new HttpError(409, `This booking cannot move to “${f.to}” from its current status.`);
    await recordAudit(actor, `booking.${f.to}`, f.id, { from: prev, note: f.note });
    revalidatePath("/admin/bookings");
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(path, failure(error), "bad");
  }
  back(path, "Status updated.");
}

const refundForm = z.object({
  id: z.string().regex(/^tb_[a-z0-9]{8,40}$/),
  amount: z.coerce.number().positive().max(100_000_000),
  reason: z.string().trim().min(3).max(300),
});

export async function refund(formData: FormData) {
  const id = String(formData.get("id") || "");
  const path = `/admin/bookings/${encodeURIComponent(id)}`;
  try {
    const actor = await authorize("payments.refund");
    const f = parseForm(refundForm, formData);
    const r = await refundBooking(f.id, Math.round(f.amount * 100), f.reason, actor.email);
    await recordAudit(actor, "booking.refund", f.id, { amount: f.amount, refundId: r.refundId, reason: f.reason });
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(path, failure(error), "bad");
  }
  back(path, "Refund requested. The booking updates when the provider confirms it.");
}
