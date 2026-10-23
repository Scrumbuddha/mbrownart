import { describe, expect, it } from "vitest";
import type { Order } from "../db/schema";
import { taxCsv } from "./tax-csv";

const order = (over: Partial<Order> = {}): Order => ({
  id: "1", paypalOrderId: "P", paintingId: "x", item: "original", status: "paid",
  itemCents: 42000, shippingCents: 1000, taxCents: 3010, totalCents: 46010, taxCounty: "Pinellas",
  buyerName: "A", buyerEmail: "a@b.c", shipTo: null, createdAt: new Date(),
  paidAt: new Date("2026-11-03T17:00:00Z"), shippedAt: null, captureStartedAt: null, attention: null,
  ...over,
});
const HEADER = "date,county,taxable_amount,tax_collected";

describe("taxCsv", () => {
  it("outputs one row per taxed order with item plus shipping as the taxable amount", () => {
    expect(taxCsv([order()], "2026-11")).toBe(`${HEADER}\n2026-11-03,Pinellas,430.00,30.10\n`);
  });
  it("excludes zero-tax orders, other months, and unpaid orders", () => {
    const csv = taxCsv([
      order({ taxCents: 0, taxCounty: null, id: "ga" }),
      order({ paidAt: new Date("2026-12-03T17:00:00Z") }),
      order({ status: "pending", paidAt: null }),
    ], "2026-11");
    expect(csv).toBe(`${HEADER}\n`);
  });
  it("uses the Florida date: 9pm ET on Oct 31 is October, not November", () => {
    const lateOct = order({ paidAt: new Date("2026-11-01T01:00:00Z") }); // 9pm EDT Oct 31
    expect(taxCsv([lateOct], "2026-10")).toBe(`${HEADER}\n2026-10-31,Pinellas,430.00,30.10\n`);
    expect(taxCsv([lateOct], "2026-11")).toBe(`${HEADER}\n`);
  });
  it("uses standard time after the fall change (Dec 1 00:30 UTC is Nov 30 in Florida)", () => {
    const o = order({ paidAt: new Date("2026-12-01T00:30:00Z") });
    expect(taxCsv([o], "2026-11")).toContain("2026-11-30,");
  });
  it("quotes a county containing a comma", () => {
    expect(taxCsv([order({ taxCounty: "Foo, Bar" })], "2026-11")).toContain('"Foo, Bar"');
  });
});
