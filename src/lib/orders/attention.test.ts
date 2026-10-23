import { describe, expect, it } from "vitest";
import type { Order } from "../db/schema";
import { ATTENTION_MESSAGES, canShip, countsForTax, NO_SHIP_ATTENTION, shipControl } from "./attention";

const o = (over: Partial<Order> = {}) => ({
  attention: null, paypalEnv: "live", buyerEmail: "a@b.c", shippedAt: null, shippedEmailSentAt: null, ...over,
} as Pick<Order, "attention" | "paypalEnv" | "buyerEmail" | "shippedAt" | "shippedEmailSentAt">);

describe("order attention policy", () => {
  it("has banner copy for every attention value", () => {
    expect(ATTENTION_MESSAGES.payment_pending).toBe(
      "PayPal is still clearing this payment. Wait until PayPal shows it as completed before shipping.",
    );
    expect(ATTENTION_MESSAGES.unavailable_paid).toBe(
      "Refund needed: this original was no longer for sale when the payment completed. Refund this buyer in PayPal.",
    );
    expect(ATTENTION_MESSAGES.sold_twice).toMatch(/already sold to another buyer/);
    expect(ATTENTION_MESSAGES.amount_mismatch).toMatch(/didn't match/);
  });

  it("offers no ship control for refunds, payments still clearing, or sandbox test orders", () => {
    expect(canShip(o())).toBe(true);
    expect(canShip(o({ attention: "amount_mismatch" }))).toBe(true);
    expect(canShip(o({ attention: "sold_twice" }))).toBe(false);
    expect(canShip(o({ attention: "unavailable_paid" }))).toBe(false);
    expect(canShip(o({ attention: "payment_pending" }))).toBe(false);
    expect(canShip(o({ paypalEnv: "sandbox" }))).toBe(false);
    expect([...NO_SHIP_ATTENTION].sort()).toEqual(["payment_pending", "sold_twice", "unavailable_paid"]);
  });

  it("counts only live orders that were not refunded for tax", () => {
    expect(countsForTax(o())).toBe(true);
    expect(countsForTax(o({ attention: "amount_mismatch" }))).toBe(true);
    expect(countsForTax(o({ attention: "payment_pending" }))).toBe(true);
    expect(countsForTax(o({ attention: "sold_twice" }))).toBe(false);
    expect(countsForTax(o({ attention: "unavailable_paid" }))).toBe(false);
    expect(countsForTax(o({ paypalEnv: "sandbox" }))).toBe(false);
  });

  it("picks the ship control, never offering an email resend without a buyer email", () => {
    const shipped = new Date("2026-11-06T12:00:00Z");
    expect(shipControl(o())).toBe("mark_shipped");
    expect(shipControl(o({ attention: "sold_twice" }))).toBe("none");
    expect(shipControl(o({ paypalEnv: "sandbox" }))).toBe("none");
    expect(shipControl(o({ shippedAt: shipped, shippedEmailSentAt: shipped }))).toBe("shipped");
    expect(shipControl(o({ shippedAt: shipped }))).toBe("resend_email");
    expect(shipControl(o({ shippedAt: shipped, buyerEmail: null }))).toBe("no_buyer_email");
  });
});
