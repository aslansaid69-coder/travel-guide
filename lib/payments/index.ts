import "server-only";
import { stripeProvider } from "./stripe";
import type { PaymentProvider } from "./types";

const providers: Record<string, PaymentProvider> = { stripe: stripeProvider };

/** PAYMENT_PROVIDER selects the provider (default: stripe). */
export function paymentProvider(): PaymentProvider {
  return providers[process.env.PAYMENT_PROVIDER || "stripe"] ?? stripeProvider;
}
