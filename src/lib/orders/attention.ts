import type { Order } from "../db/schema";

/**
 * Studio Orders policy for each order flag, in one place: the banner copy, whether the order can
 * be shipped, and whether it counts for the Florida tax report.
 */
export type Attention = NonNullable<Order["attention"]>;

/** Studio Orders banner copy for each attention value. */
export const ATTENTION_MESSAGES: Record<Attention, string> = {
  sold_twice: "Refund needed: this original had already sold to another buyer. Refund this buyer in PayPal.",
  unavailable_paid:
    "Refund needed: this original was no longer for sale when the payment completed. Refund this buyer in PayPal.",
  amount_mismatch: "Please check this payment in PayPal: the amount paid didn't match the order.",
  payment_pending:
    "PayPal is still clearing this payment. Wait until PayPal shows it as completed before shipping.",
};

export const TEST_ORDER_LABEL = "Test order (sandbox)";

/** Paid orders with nothing to ship (yet): a refund is owed, or PayPal hasn't cleared the money. */
export const NO_SHIP_ATTENTION: readonly Attention[] = ["sold_twice", "unavailable_paid", "payment_pending"];

/** Refunded orders: the sale didn't happen, so no tax is owed on it. */
const REFUND_ATTENTION: readonly Attention[] = ["sold_twice", "unavailable_paid"];

type Flags = Pick<Order, "attention" | "paypalEnv">;

/** Whether the Studio should offer shipping for this order. Sandbox test orders are never shipped. */
export function canShip(o: Flags): boolean {
  return o.paypalEnv !== "sandbox" && !(o.attention && NO_SHIP_ATTENTION.includes(o.attention));
}

/**
 * Whether a paid order belongs in the tax report. A payment still clearing counts: tax was
 * collected, and leaving it out risks under-reporting if it clears after the export.
 */
export function countsForTax(o: Flags): boolean {
  return o.paypalEnv !== "sandbox" && !(o.attention && REFUND_ATTENTION.includes(o.attention));
}

export type ShipControl = "none" | "mark_shipped" | "shipped" | "resend_email" | "no_buyer_email";

/** Which shipping control the order card shows. */
export function shipControl(o: Flags & Pick<Order, "buyerEmail" | "shippedAt" | "shippedEmailSentAt">): ShipControl {
  if (!canShip(o)) return "none";
  if (!o.shippedAt) return "mark_shipped";
  if (o.shippedEmailSentAt) return "shipped";
  return o.buyerEmail ? "resend_email" : "no_buyer_email";
}
