import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../db/test-db";
import { orders, paintings, settings, type ShipTo } from "../db/schema";
import type { Db } from "../db/client";
import { createFakePayPal, type FakePayPal } from "../paypal/fake";
import { CheckoutError } from "./errors";
import { HOLD_MS, completeCheckout, recordPaidOrder, startCheckout, updateShipping } from "./service";

const base = {
  slug: "harbor", title: "Harbor", medium: "Watercolor", size: "11x14", year: 2024,
  description: "", imageUrl: "u", imageLargeUrl: "l", imageWidth: 800, imageHeight: 600,
  originalPriceCents: 42000, printEnabled: true, printSize: "8x10", printPriceCents: 4500,
};
const flShip: ShipTo = { name: "Ann Lee", line1: "1 Central Ave", city: "St. Petersburg", state: "FL", zip: "33701", country: "US" };
const gaShip: ShipTo = { name: "Bo Cole", line1: "2 Peach St", city: "Atlanta", state: "GA", zip: "30301", country: "US" };
const t0 = new Date("2026-10-22T12:00:00Z");
const at = (ms: number) => new Date(t0.getTime() + ms);
const MIN = 60 * 1000;

async function setup(overrides: Partial<typeof paintings.$inferInsert> = {}) {
  const db = await createTestDb();
  const [p] = await db.insert(paintings).values({ ...base, ...overrides }).returning();
  const pp = createFakePayPal();
  return { db, pp, paintingId: p.id };
}

async function painting(db: Db, id: string) {
  const [row] = await db.select().from(paintings).where(eq(paintings.id, id));
  return row;
}
async function order(db: Db, paypalOrderId: string) {
  const [row] = await db.select().from(orders).where(eq(orders.paypalOrderId, paypalOrderId));
  return row;
}
async function expectCode(p: Promise<unknown>, code: string) {
  await expect(p).rejects.toBeInstanceOf(CheckoutError);
  await p.catch((e: CheckoutError) => expect(e.code).toBe(code));
}
async function buy(db: Db, pp: FakePayPal, paintingId: string, now: Date, ship = flShip) {
  const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, now);
  pp.approve(paypalOrderId, ship);
  return completeCheckout(db, pp, paypalOrderId, now);
}

describe("checkout service", () => {
  it("holds an original and creates a PayPal order with locked amounts", async () => {
    const { db, pp, paintingId } = await setup();
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    const o = await order(db, paypalOrderId);
    const p = await painting(db, paintingId);
    expect(p.heldByOrderId).toBe(o.id);
    expect(p.heldUntil?.getTime()).toBe(t0.getTime() + HOLD_MS);
    expect(o).toMatchObject({ status: "pending", item: "original", itemCents: 42000, shippingCents: 1000, taxCents: 0, totalCents: 43000 });
    expect((await pp.getOrder(paypalOrderId)).totalCents).toBe(43000);
  });

  it("second buyer gets held while first holds it", async () => {
    const { db, pp, paintingId } = await setup();
    await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    await expectCode(startCheckout(db, pp, { paintingId, item: "original" }, at(5 * MIN)), "held");
    const rows = await db.select().from(orders);
    expect(rows.map((r) => r.status).sort()).toEqual(["failed", "pending"]);
  });

  it("second buyer can start after hold expires", async () => {
    const { db, pp, paintingId } = await setup();
    await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, at(16 * MIN));
    const o = await order(db, paypalOrderId);
    expect((await painting(db, paintingId)).heldByOrderId).toBe(o.id);
  });

  it("print checkout does not hold the painting and works when original is sold", async () => {
    const { db, pp, paintingId } = await setup({ originalStatus: "sold" });
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "print" }, t0);
    expect((await painting(db, paintingId)).heldByOrderId).toBeNull();
    expect((await pp.getOrder(paypalOrderId)).totalCents).toBe(5500);
    pp.approve(paypalOrderId, gaShip);
    const paid = await completeCheckout(db, pp, paypalOrderId, t0);
    expect(paid).toMatchObject({ status: "paid", item: "print", totalCents: 5500 });
    expect((await painting(db, paintingId)).originalStatus).toBe("sold");
  });

  it("rejects non-US shipping", async () => {
    const { db, pp, paintingId } = await setup();
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    await expectCode(updateShipping(db, pp, { paypalOrderId, country: "CA", state: "ON", zip: "M5V" }), "not_us");
  });

  it("recomputes tax when address changes state", async () => {
    const { db, pp, paintingId } = await setup();
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    const calls: number[] = [];
    const orig = pp.updateAmounts.bind(pp);
    pp.updateAmounts = async (id, a) => { calls.push(a.taxCents); return orig(id, a); };

    const fl = await updateShipping(db, pp, { paypalOrderId, country: "US", state: "FL", zip: "33701" });
    expect(fl).toEqual({ itemCents: 42000, shippingCents: 1000, taxCents: 3010 });
    expect(await order(db, paypalOrderId)).toMatchObject({ taxCents: 3010, taxCounty: "Pinellas", totalCents: 46010 });
    expect((await pp.getOrder(paypalOrderId)).totalCents).toBe(46010);

    const ga = await updateShipping(db, pp, { paypalOrderId, country: "US", state: "GA", zip: "30301" });
    expect(ga.taxCents).toBe(0);
    expect(await order(db, paypalOrderId)).toMatchObject({ taxCents: 0, taxCounty: null, totalCents: 43000 });
    expect(calls).toEqual([3010, 0]);
  });

  it("completes: order paid, original sold, hold cleared", async () => {
    const { db, pp, paintingId } = await setup();
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    await updateShipping(db, pp, { paypalOrderId, country: "US", state: "FL", zip: "33701" });
    pp.approve(paypalOrderId, flShip);
    const paid = await completeCheckout(db, pp, paypalOrderId, at(MIN));
    expect(paid).toMatchObject({
      status: "paid", totalCents: 46010, buyerName: "Ann Lee", buyerEmail: "buyer@example.com", shipTo: flShip,
    });
    expect(paid.paidAt?.getTime()).toBe(at(MIN).getTime());
    const p = await painting(db, paintingId);
    expect(p).toMatchObject({ originalStatus: "sold", heldByOrderId: null, heldUntil: null });
  });

  it("recomputes tax at completion from PayPal's ship-to before capturing", async () => {
    const { db, pp, paintingId } = await setup();
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    pp.approve(paypalOrderId, flShip); // updateShipping never called
    const paid = await completeCheckout(db, pp, paypalOrderId, t0);
    expect(paid).toMatchObject({ taxCents: 3010, totalCents: 46010 });
    expect((await pp.getOrder(paypalOrderId)).totalCents).toBe(46010);
  });

  it("refuses to capture when PayPal has no ship-to", async () => {
    const { db, pp, paintingId } = await setup();
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    pp.approve(paypalOrderId, flShip);
    pp.orders.get(paypalOrderId)!.shipTo = null;
    await expectCode(completeCheckout(db, pp, paypalOrderId, t0), "amount_mismatch");
    expect(pp.captureCount(paypalOrderId)).toBe(0);
  });

  it("refuses to capture when PayPal's total differs from ours", async () => {
    const { db, pp, paintingId } = await setup();
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    pp.approve(paypalOrderId, gaShip);
    pp.orders.get(paypalOrderId)!.totalCents = 100;
    await expectCode(completeCheckout(db, pp, paypalOrderId, t0), "amount_mismatch");
    expect(pp.captureCount(paypalOrderId)).toBe(0);
  });

  it("capture is idempotent", async () => {
    const { db, pp, paintingId } = await setup();
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    pp.approve(paypalOrderId, flShip);
    const first = await completeCheckout(db, pp, paypalOrderId, t0);
    const second = await completeCheckout(db, pp, paypalOrderId, at(MIN));
    expect(second).toEqual(first);
    expect(pp.captureCount(paypalOrderId)).toBe(1);
  });

  it("refuses capture when hold expired and another buyer bought it", async () => {
    const { db, pp, paintingId } = await setup();
    const a = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    pp.approve(a.paypalOrderId, flShip);
    const bPaid = await buy(db, pp, paintingId, at(16 * MIN), gaShip);
    expect(bPaid.status).toBe("paid");

    await expectCode(completeCheckout(db, pp, a.paypalOrderId, at(17 * MIN)), "sold");
    expect(pp.captureCount(a.paypalOrderId)).toBe(0);
    expect((await order(db, a.paypalOrderId)).status).toBe("failed");
  });

  it("refuses capture when hold expired and another buyer currently holds it", async () => {
    const { db, pp, paintingId } = await setup();
    const a = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    pp.approve(a.paypalOrderId, flShip);
    await startCheckout(db, pp, { paintingId, item: "original" }, at(16 * MIN));
    await expectCode(completeCheckout(db, pp, a.paypalOrderId, at(17 * MIN)), "sold");
    expect(pp.captureCount(a.paypalOrderId)).toBe(0);
  });

  it("completes when own hold expired but nobody else took it", async () => {
    const { db, pp, paintingId } = await setup();
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    pp.approve(paypalOrderId, flShip);
    const paid = await completeCheckout(db, pp, paypalOrderId, at(20 * MIN));
    expect(paid.status).toBe("paid");
  });

  it("capture refused if artist marked sold mid-checkout", async () => {
    const { db, pp, paintingId } = await setup();
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    pp.approve(paypalOrderId, flShip);
    await db.update(paintings).set({ originalStatus: "sold" }).where(eq(paintings.id, paintingId));
    await expectCode(completeCheckout(db, pp, paypalOrderId, t0), "sold");
    expect(pp.captureCount(paypalOrderId)).toBe(0);
    expect((await order(db, paypalOrderId)).status).toBe("failed");
  });

  it("price edit mid-checkout does not change charged amount", async () => {
    const { db, pp, paintingId } = await setup();
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    await db.update(paintings).set({ originalPriceCents: 99000 }).where(eq(paintings.id, paintingId));
    pp.approve(paypalOrderId, gaShip);
    const paid = await completeCheckout(db, pp, paypalOrderId, t0);
    expect(paid).toMatchObject({ itemCents: 42000, totalCents: 43000 });
    expect((await pp.getOrder(paypalOrderId)).totalCents).toBe(43000);
  });

  it("declined capture releases hold and marks failed", async () => {
    const { db, pp, paintingId } = await setup();
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    pp.approve(paypalOrderId, flShip);
    pp.failNextCapture("declined");
    await expectCode(completeCheckout(db, pp, paypalOrderId, t0), "payment_failed");
    expect(pp.captureCount(paypalOrderId)).toBe(1);
    expect((await order(db, paypalOrderId)).status).toBe("failed");
    expect(await painting(db, paintingId)).toMatchObject({ originalStatus: "for_sale", heldByOrderId: null, heldUntil: null });
    // a fresh checkout can start immediately
    await startCheckout(db, pp, { paintingId, item: "original" }, t0);
  });

  it("does not release the hold when PayPal's status cannot be confirmed", async () => {
    const { db, pp, paintingId } = await setup();
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    pp.approve(paypalOrderId, flShip);
    pp.failNextCapture("declined");
    const realGet = pp.getOrder.bind(pp);
    pp.getOrder = async (id) => { if (pp.captureCount(id) > 0) throw new Error("network"); return realGet(id); };
    await expectCode(completeCheckout(db, pp, paypalOrderId, t0), "payment_failed");
    expect((await order(db, paypalOrderId)).status).toBe("pending");
    expect((await painting(db, paintingId)).heldByOrderId).toBe((await order(db, paypalOrderId)).id);
  });

  it("timeout-but-completed capture is recorded as paid, not released", async () => {
    const { db, pp, paintingId } = await setup();
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    pp.approve(paypalOrderId, flShip);
    pp.failNextCapture("timeout-but-completed");
    const paid = await completeCheckout(db, pp, paypalOrderId, t0);
    expect(paid.status).toBe("paid");
    expect((await painting(db, paintingId)).originalStatus).toBe("sold");
  });

  it("releases the hold and fails the order when PayPal createOrder throws", async () => {
    const { db, pp, paintingId } = await setup();
    pp.createOrder = async () => { throw new Error("down"); };
    await expectCode(startCheckout(db, pp, { paintingId, item: "original" }, t0), "payment_failed");
    expect((await painting(db, paintingId)).heldByOrderId).toBeNull();
    expect((await db.select().from(orders)).map((o) => o.status)).toEqual(["failed"]);
  });

  it("refuses print checkout when print disabled", async () => {
    const { db, pp, paintingId } = await setup({ printEnabled: false });
    await expectCode(startCheckout(db, pp, { paintingId, item: "print" }, t0), "unavailable");
  });

  it("refuses hidden, not-for-sale, unpriced and sold originals", async () => {
    for (const [o, code] of [
      [{ visible: false }, "unavailable"],
      [{ originalStatus: "not_for_sale" as const }, "unavailable"],
      [{ originalPriceCents: null }, "unavailable"],
      [{ originalStatus: "sold" as const }, "sold"],
    ] as const) {
      const { db, pp, paintingId } = await setup(o);
      await expectCode(startCheckout(db, pp, { paintingId, item: "original" }, t0), code);
    }
  });

  it("uses the shipping fee from settings", async () => {
    const { db, pp, paintingId } = await setup();
    await db.update(settings).set({ shippingCents: 1500 });
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    expect((await pp.getOrder(paypalOrderId)).totalCents).toBe(43500);
  });
});

describe("recordPaidOrder", () => {
  it("records once even when called twice with a stale order row", async () => {
    const { db, pp, paintingId } = await setup();
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    pp.approve(paypalOrderId, flShip);
    const stale = await order(db, paypalOrderId);
    const captured = await pp.captureOrder(paypalOrderId);
    const [a, b] = await Promise.all([
      recordPaidOrder(db, captured, stale, at(MIN)),
      recordPaidOrder(db, captured, stale, at(2 * MIN)),
    ]);
    expect(a.paidAt?.getTime()).toBe(b.paidAt?.getTime());
    expect((await order(db, paypalOrderId)).status).toBe("paid");
    expect((await painting(db, paintingId)).originalStatus).toBe("sold");
  });

  it("refuses to record an order PayPal has not completed", async () => {
    const { db, pp, paintingId } = await setup();
    const { paypalOrderId } = await startCheckout(db, pp, { paintingId, item: "original" }, t0);
    pp.approve(paypalOrderId, flShip);
    const o = await order(db, paypalOrderId);
    await expectCode(recordPaidOrder(db, await pp.getOrder(paypalOrderId), o, t0), "payment_failed");
    expect((await order(db, paypalOrderId)).status).toBe("pending");
  });
});
