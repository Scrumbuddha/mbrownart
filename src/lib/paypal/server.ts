import { createPayPalRest } from "./rest";
import type { PayPalApi } from "./types";

let cached: PayPalApi | null = null;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

/** Builds (once per process) the live PayPal REST client from env. */
export function getPayPal(): PayPalApi {
  if (!cached) {
    cached = createPayPalRest({
      clientId: need("PAYPAL_CLIENT_ID"),
      clientSecret: need("PAYPAL_CLIENT_SECRET"),
      mode: process.env.PAYPAL_ENV === "live" ? "live" : "sandbox",
      webhookId: need("PAYPAL_WEBHOOK_ID"),
    });
  }
  return cached;
}
