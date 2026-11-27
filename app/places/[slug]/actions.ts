"use server";
import { revalidatePath } from "next/cache";
import { authorize } from "@/lib/auth/session";
import { submitReview } from "@/lib/reviews/store";
import { actionLimit } from "@/lib/rate-limit";
import { failure, formObject } from "@/lib/admin/form";

export type ReviewState = { ok: boolean; message: string };

export async function postReview(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  try {
    const user = await authorize("review.write");
    await actionLimit("review", 10, user.id);
    await submitReview(user, formObject(formData));
    revalidatePath(`/places/${String(formData.get("slug") || "")}`);
    return { ok: true, message: "Thank you! Your review will appear after a quick check by our team." };
  } catch (error) {
    return { ok: false, message: failure(error) };
  }
}
