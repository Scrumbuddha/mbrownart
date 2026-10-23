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

/**
 * Full webhook request: signature first, then parse, then dispatch. A thrown error becomes 500
 * so PayPal retries; the log carries only event id, type and error name (no PII).
 */
export async function handleWebhookRequest(
  db: Db,
  pp: PayPalApi,
  headers: Headers,
  raw: string,
  now: Date,
): Promise<{ status: number; body: unknown }> {
  let eventId: string | undefined;
  let eventType: string | undefined;
  try {
    if (!(await pp.verifyWebhook(headers, raw))) return { status: 400, body: { ok: false } };
    let event: any;
    try {
      event = JSON.parse(raw);
    } catch {
      return { status: 400, body: { ok: false } };
    }
    if (typeof event !== "object" || event === null) return { status: 400, body: { ok: false } };
    eventId = typeof event.id === "string" ? event.id : undefined;
    eventType = typeof event.event_type === "string" ? event.event_type : undefined;
    await handleWebhookEvent(db, pp, event, now);
    return { status: 200, body: { ok: true } };
  } catch (e) {
    console.error("paypal webhook failed:", { eventId, eventType, error: e instanceof Error ? e.name : "unknown" });
    return { status: 500, body: { ok: false } };
  }
}
