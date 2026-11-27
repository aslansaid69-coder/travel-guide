"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { authorize } from "@/lib/auth/session";
import { ownBooking } from "@/lib/tours/service";
import { startCheckout, transition } from "@/lib/tours/payments";
import { actionLimit } from "@/lib/rate-limit";
import { back, failure, isRedirect } from "@/lib/admin/form";

const idSchema = z.string().regex(/^tb_[a-z0-9]{8,40}$/);

export async function payBooking(formData: FormData) {
  const id = idSchema.parse(formData.get("id"));
  let url: string;
  try {
    const user = await authorize("trip.book");
    await actionLimit("tour-pay", 30, user.id);
    const booking = await ownBooking(id, user.id);
    url = (await startCheckout(booking, user)).url;
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/bookings/${id}`, failure(error), "bad");
  }
  redirect(url);
}

export async function cancelBooking(formData: FormData) {
  const id = idSchema.parse(formData.get("id"));
  try {
    const user = await authorize("trip.book");
    const booking = await ownBooking(id, user.id);
    if (booking.status !== "pending")
      back(`/bookings/${id}`, "Paid bookings are cancelled by our team so refunds follow the cancellation terms. Please write to us.", "bad");
    await transition(id, "cancelled", user.id, "Cancelled by traveller before payment");
  } catch (error) {
    if (isRedirect(error)) throw error;
    back(`/bookings/${id}`, failure(error), "bad");
  }
  back(`/bookings/${id}`, "Booking cancelled.");
}
