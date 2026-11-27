/**
 * Payment provider abstraction. Stripe is implemented; a local provider (Kaspi, Halyk ePay,
 * CloudPayments…) only needs to implement this interface and register in lib/payments/index.ts.
 */
export type CheckoutRequest = {
  bookingId: string;
  amountMinor: number;
  currency: string;
  title: string;
  description: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  /** Same key for retries of the same attempt so the provider never creates duplicates. */
  idempotencyKey: string;
  expiresInMinutes: number;
};
export type CheckoutSession = { sessionId: string; url: string; livemode: boolean };

export type PaymentEvent =
  | { kind: "paid"; eventId: string; bookingId: string; sessionId: string; paymentId: string; amountMinor: number; currency: string; receiptUrl?: string; livemode: boolean }
  | { kind: "failed" | "expired"; eventId: string; bookingId: string; sessionId: string }
  | { kind: "refunded"; eventId: string; bookingId: string; paymentId: string; amountMinor: number; refundId: string }
  | { kind: "ignored"; eventId: string };

export interface PaymentProvider {
  id: "stripe";
  label: string;
  configured(): boolean;
  /** True when using test credentials (default). Live mode requires PAYMENTS_LIVE=true. */
  testMode(): boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  refund(paymentId: string, amountMinor: number, bookingId: string, reason: string): Promise<{ refundId: string; status: string }>;
}
