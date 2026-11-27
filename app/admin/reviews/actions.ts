"use server";
import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth/session";
import { recordAudit } from "@/lib/audit";
import { moderateReview } from "@/lib/reviews/store";
import { back, failure, formObject, isRedirect } from "@/lib/admin/form";
import { database } from "@/lib/db";

export async function moderate(formData: FormData) {
  try {
    const actor = await authorize("reviews.moderate");
    const r = await moderateReview(formObject(formData), actor.id);
    await recordAudit(actor, `review.${r.status}`, r.id, { placeId: r.placeId, note: r.note });
    const slug = (await database()`SELECT COALESCE(NULLIF(data->>'slug',''), id) AS s FROM hub_catalog WHERE id=${r.placeId}`)[0]?.s;
    if (slug) revalidatePath(`/places/${String(slug)}`);
  } catch (error) {
    if (isRedirect(error)) throw error;
    back("/admin/reviews", failure(error), "bad");
  }
  back("/admin/reviews", "Review updated.");
}
