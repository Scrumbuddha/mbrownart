import type { ShipTo } from "@/lib/db/schema";

export type Amounts = { itemCents: number; shippingCents: number; taxCents: number };

export type PayPalOrderStatus = "CREATED" | "APPROVED" | "COMPLETED" | "VOIDED" | "PAYER_ACTION_REQUIRED";

/**
 * Status of the first capture, which can differ from the order status: a 2xx capture can carry
 * a DECLINED or FAILED capture, and PENDING means PayPal is still clearing it. null = no capture.
 */
export type PayPalCaptureStatus = "COMPLETED" | "PENDING" | "DECLINED" | "FAILED";

export type PayPalOrder = {
  id: string;
  status: PayPalOrderStatus;
  totalCents: number;
  payer: { name: string; email: string } | null;
  shipTo: ShipTo | null;
  captureStatus: PayPalCaptureStatus | null;
};

export interface PayPalApi {
  /** Which PayPal environment this client talks to (from PAYPAL_ENV); sandbox orders are tests. */
  readonly mode: "sandbox" | "live";
  createOrder(input: { referenceId: string; description: string } & Amounts): Promise<{ id: string }>;
  updateAmounts(paypalOrderId: string, a: Amounts): Promise<void>;
  captureOrder(paypalOrderId: string): Promise<PayPalOrder>;
  getOrder(paypalOrderId: string): Promise<PayPalOrder>;
  verifyWebhook(headers: Headers, rawBody: string): Promise<boolean>;
}

export type PayPalEnv = {
  clientId: string;
  clientSecret: string;
  mode: "sandbox" | "live";
  webhookId: string;
};
