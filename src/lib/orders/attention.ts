import type { Order } from "../db/schema";

export type Attention = NonNullable<Order["attention"]>;

/** Studio Orders banner copy for each attention value. */
export const ATTENTION_MESSAGES: Record<Attention, string> = {
  sold_twice: "Refund needed: this original had already sold to another buyer. Refund this buyer in PayPal.",
  amount_mismatch: "Please check this payment in PayPal: the amount paid didn't match the order.",
  payment_pending:
    "PayPal is still clearing this payment. Wait until PayPal shows it as completed before shipping.",
};

/** Paid orders with nothing to ship (yet): a refund is owed, or PayPal hasn't cleared the money. */
export const NO_SHIP_ATTENTION: readonly Attention[] = ["sold_twice", "payment_pending"];

/** Whether the Studio should offer the ship control for this order. */
export function canShip(o: Pick<Order, "attention">): boolean {
  return !o.attention || !NO_SHIP_ATTENTION.includes(o.attention);
}
