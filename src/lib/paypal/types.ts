import type { ShipTo } from "@/lib/db/schema";

export type Amounts = { itemCents: number; shippingCents: number; taxCents: number };

export type PayPalOrderStatus = "CREATED" | "APPROVED" | "COMPLETED" | "VOIDED" | "PAYER_ACTION_REQUIRED";

export type PayPalOrder = {
  id: string;
  status: PayPalOrderStatus;
  totalCents: number;
  payer: { name: string; email: string } | null;
  shipTo: ShipTo | null;
};

export interface PayPalApi {
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
