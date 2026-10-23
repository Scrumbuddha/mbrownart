import { describe, expect, it } from "vitest";
import { ATTENTION_MESSAGES, canShip, NO_SHIP_ATTENTION } from "./attention";

describe("order attention policy", () => {
  it("has banner copy for every attention value", () => {
    expect(ATTENTION_MESSAGES.payment_pending).toBe(
      "PayPal is still clearing this payment. Wait until PayPal shows it as completed before shipping.",
    );
    expect(ATTENTION_MESSAGES.sold_twice).toMatch(/already sold to another buyer/);
    expect(ATTENTION_MESSAGES.amount_mismatch).toMatch(/didn't match/);
  });

  it("offers no ship control for refunds or payments still clearing", () => {
    expect(canShip({ attention: null })).toBe(true);
    expect(canShip({ attention: "amount_mismatch" })).toBe(true);
    expect(canShip({ attention: "sold_twice" })).toBe(false);
    expect(canShip({ attention: "payment_pending" })).toBe(false);
    expect([...NO_SHIP_ATTENTION].sort()).toEqual(["payment_pending", "sold_twice"]);
  });
});
