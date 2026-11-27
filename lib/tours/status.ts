/**
 * Booking lifecycle: pending → paid → confirmed → completed,
 * with cancelled (before completion) and refunded (after a payment) as terminal states.
 */
export const BOOKING_STATUSES = ["pending", "paid", "confirmed", "completed", "cancelled", "refunded"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const NEXT: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ["paid", "cancelled"],
  paid: ["confirmed", "cancelled", "refunded"],
  confirmed: ["completed", "cancelled", "refunded"],
  completed: ["refunded"],
  cancelled: ["refunded"],
  refunded: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus) {
  return NEXT[from].includes(to);
}
export function nextStatuses(from: BookingStatus) {
  return NEXT[from];
}
/** Statuses that hold the guide's calendar. */
export const ACTIVE_STATUSES: readonly BookingStatus[] = ["pending", "paid", "confirmed"];
/** Who may trigger a transition. Payments come only from verified provider webhooks. */
export function transitionActor(to: BookingStatus): "webhook" | "staff" | "staff-or-owner-of-booking" {
  if (to === "paid") return "webhook";
  if (to === "cancelled") return "staff-or-owner-of-booking";
  return "staff";
}
export const STATUS_LABELS: Record<BookingStatus, { en: string; ru: string; kk: string }> = {
  pending: { en: "Awaiting payment", ru: "Ожидает оплаты", kk: "Төлемді күтуде" },
  paid: { en: "Paid", ru: "Оплачено", kk: "Төленді" },
  confirmed: { en: "Confirmed", ru: "Подтверждено", kk: "Расталды" },
  completed: { en: "Completed", ru: "Завершено", kk: "Аяқталды" },
  cancelled: { en: "Cancelled", ru: "Отменено", kk: "Бас тартылды" },
  refunded: { en: "Refunded", ru: "Возвращено", kk: "Қайтарылды" },
};
