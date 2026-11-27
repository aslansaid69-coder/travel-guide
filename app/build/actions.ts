"use server";
import { authorize, currentUser } from "@/lib/auth/session";
import { actionLimit } from "@/lib/rate-limit";
import { failure } from "@/lib/admin/form";
import { createBooking, publicMatch, quoteTour, tourRequestSchema, type PublicGuideMatch, type TourQuote } from "@/lib/tours/service";

export type QuoteResult =
  | { ok: true; quote: TourQuote; guides: PublicGuideMatch[] | null; signedIn: boolean }
  | { ok: false; error: string };

/** Server-side estimate (the browser never computes prices). */
export async function getQuote(raw: unknown): Promise<QuoteResult> {
  try {
    await actionLimit("tour-quote", 240);
    const input = tourRequestSchema.parse(raw);
    const { matches, ...quote } = await quoteTour(input);
    const user = await currentUser();
    return {
      ok: true,
      quote,
      guides: matches ? matches.map((m) => publicMatch(m, input.language)) : null,
      signedIn: !!user,
    };
  } catch (error) {
    return { ok: false, error: failure(error) };
  }
}

export async function bookTour(raw: unknown): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const user = await authorize("trip.book");
    await actionLimit("tour-book", 20, user.id);
    const { id } = await createBooking(user, raw);
    return { ok: true, id };
  } catch (error) {
    return { ok: false, error: failure(error) };
  }
}
