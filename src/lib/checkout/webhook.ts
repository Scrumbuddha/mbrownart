import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { orders } from "../db/schema";
import type { PayPalApi } from "../paypal/types";
import { recordPaidOrder } from "./service";

export type WebhookResult = "recorded" | "ignored" | "already-paid";

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function handleWebhookEvent(
  db: Db,
  pp: PayPalApi,
  event: { event_type: string; resource: any },
  now: Date,
): Promise<WebhookResult> {
  if (event.event_type !== "PAYMENT.CAPTURE.COMPLETED") return "ignored";
  const paypalOrderId = event.resource?.supplementary_data?.related_ids?.order_id;
  if (typeof paypalOrderId !== "string" || !paypalOrderId) return "ignored";

  const [row] = await db.select().from(orders).where(eq(orders.paypalOrderId, paypalOrderId));
  if (!row) return "ignored";
  if (row.status === "paid") return "already-paid";

  const ppOrder = await pp.getOrder(paypalOrderId);
  await recordPaidOrder(db, ppOrder, row, now);
  return "recorded";
}
