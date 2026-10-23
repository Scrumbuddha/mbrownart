import { and, eq, isNull, lt, ne, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { orders, paintings, type Order, type ShipTo } from "../db/schema";
import { getSettings } from "../db/settings";
import { isOriginalPurchasable } from "../paintings/queries";
import type { Amounts, PayPalApi, PayPalOrder } from "../paypal/types";
import { computeTax } from "../tax/florida";
import { CheckoutError } from "./errors";

export const HOLD_MS = 15 * 60 * 1000;

const amountsOf = (o: Order): Amounts => ({
  itemCents: o.itemCents, shippingCents: o.shippingCents, taxCents: o.taxCents,
});

async function orderByPayPalId(db: Db, paypalOrderId: string): Promise<Order> {
  const [row] = await db.select().from(orders).where(eq(orders.paypalOrderId, paypalOrderId));
  if (!row) throw new CheckoutError("unavailable");
  return row;
}

async function markFailed(db: Db, orderId: string): Promise<void> {
  await db.update(orders).set({ status: "failed" })
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending")));
}

/** Clears the hold only if this order is the one holding the painting. */
async function releaseHold(db: Db, paintingId: string, orderId: string): Promise<void> {
  await db.update(paintings).set({ heldUntil: null, heldByOrderId: null })
    .where(and(eq(paintings.id, paintingId), eq(paintings.heldByOrderId, orderId)));
}

/**
 * Atomically takes (or keeps) the hold for `orderId`. Succeeds only while the original is
 * for sale and nobody else holds it unexpired. Returns false when the hold was not obtained.
 */
async function claimHold(db: Db, paintingId: string, orderId: string, now: Date): Promise<boolean> {
  const rows = await db.update(paintings)
    .set({ heldUntil: new Date(now.getTime() + HOLD_MS), heldByOrderId: orderId })
    .where(and(
      eq(paintings.id, paintingId),
      eq(paintings.originalStatus, "for_sale"),
      or(isNull(paintings.heldUntil), lt(paintings.heldUntil, now), eq(paintings.heldByOrderId, orderId)),
    ))
    .returning({ id: paintings.id });
  return rows.length === 1;
}

/** Recomputes tax from the order's locked amounts and saves it. Returns the updated order. */
async function saveTax(db: Db, o: Order, state: string, zip: string): Promise<Order> {
  const { taxEnabled } = await getSettings(db);
  const { taxCents, county } = computeTax({
    state, zip, itemCents: o.itemCents, shippingCents: o.shippingCents, enabled: taxEnabled,
  });
  const [row] = await db.update(orders)
    .set({ taxCents, taxCounty: county, totalCents: o.itemCents + o.shippingCents + taxCents })
    .where(eq(orders.id, o.id))
    .returning();
  return row;
}

export async function startCheckout(
  db: Db,
  pp: PayPalApi,
  input: { paintingId: string; item: "original" | "print" },
  now: Date,
): Promise<{ paypalOrderId: string }> {
  const [p] = await db.select().from(paintings).where(eq(paintings.id, input.paintingId));
  if (!p || !p.visible) throw new CheckoutError("unavailable");

  let itemCents: number;
  let description: string;
  if (input.item === "print") {
    if (!p.printEnabled || p.printPriceCents == null) throw new CheckoutError("unavailable");
    itemCents = p.printPriceCents;
    description = `${p.title} (print${p.printSize ? `, ${p.printSize}` : ""})`;
  } else {
    if (p.originalStatus === "sold") throw new CheckoutError("sold");
    if (!isOriginalPurchasable(p, now)) throw new CheckoutError("unavailable");
    itemCents = p.originalPriceCents!;
    description = `${p.title} (original watercolor, ${p.size})`;
  }

  const { shippingCents } = await getSettings(db);
  const [o] = await db.insert(orders).values({
    paintingId: p.id, item: input.item, status: "pending",
    itemCents, shippingCents, taxCents: 0, totalCents: itemCents + shippingCents,
  }).returning();

  if (input.item === "original" && !(await claimHold(db, p.id, o.id, now))) {
    await markFailed(db, o.id);
    throw new CheckoutError("held");
  }

  let paypalOrderId: string;
  try {
    ({ id: paypalOrderId } = await pp.createOrder({ referenceId: o.id, description, ...amountsOf(o) }));
  } catch {
    await releaseHold(db, p.id, o.id);
    await markFailed(db, o.id);
    throw new CheckoutError("payment_failed");
  }
  await db.update(orders).set({ paypalOrderId }).where(eq(orders.id, o.id));
  return { paypalOrderId };
}

export async function updateShipping(
  db: Db,
  pp: PayPalApi,
  input: { paypalOrderId: string; country: string; state: string; zip: string },
): Promise<Amounts> {
  if (input.country.trim().toUpperCase() !== "US") throw new CheckoutError("not_us");
  const o = await orderByPayPalId(db, input.paypalOrderId);
  if (o.status !== "pending") return amountsOf(o);
  const updated = await saveTax(db, o, input.state, input.zip);
  const amounts = amountsOf(updated);
  await pp.updateAmounts(input.paypalOrderId, amounts);
  return amounts;
}

export async function completeCheckout(
  db: Db,
  pp: PayPalApi,
  paypalOrderId: string,
  now: Date,
): Promise<Order> {
  let o = await orderByPayPalId(db, paypalOrderId);
  if (o.status === "paid") return o;
  if (o.status !== "pending") throw new CheckoutError("payment_failed");

  // Price the order from PayPal's ship-to; never trust the browser's earlier updateShipping.
  let ppOrder = await pp.getOrder(paypalOrderId);
  const shipTo: ShipTo | null = ppOrder.shipTo;
  if (!shipTo) throw new CheckoutError("amount_mismatch");
  if (shipTo.country.trim().toUpperCase() !== "US") throw new CheckoutError("not_us");
  const repriced = await saveTax(db, o, shipTo.state, shipTo.zip);
  if (repriced.taxCents !== o.taxCents) {
    await pp.updateAmounts(paypalOrderId, amountsOf(repriced));
    ppOrder = await pp.getOrder(paypalOrderId);
  }
  o = repriced;
  if (ppOrder.totalCents !== o.totalCents) throw new CheckoutError("amount_mismatch");

  // An original must still be for sale and not held by someone else; (re)take the hold so no
  // new checkout can start while we capture.
  if (o.item === "original" && !(await claimHold(db, o.paintingId, o.id, now))) {
    await markFailed(db, o.id);
    throw new CheckoutError("sold");
  }

  let captured: PayPalOrder;
  try {
    captured = await pp.captureOrder(paypalOrderId);
  } catch {
    // The capture may have succeeded even though the call failed: ask PayPal before giving up.
    let actual: PayPalOrder;
    try {
      actual = await pp.getOrder(paypalOrderId);
    } catch {
      // Unknown outcome: leave the order pending and the hold to expire; the webhook reconciles.
      throw new CheckoutError("payment_failed");
    }
    if (actual.status === "COMPLETED") return recordPaidOrder(db, actual, o, now);
    // A declined capture ends this PayPal order; a retry is a fresh startCheckout.
    await releaseHold(db, o.paintingId, o.id);
    await markFailed(db, o.id);
    throw new CheckoutError("payment_failed");
  }
  return recordPaidOrder(db, captured, o, now);
}

/** Marks the order paid (and the original sold). Idempotent; shared with the webhook. */
export async function recordPaidOrder(
  db: Db,
  paypalOrder: PayPalOrder,
  orderRow: Order,
  now: Date,
): Promise<Order> {
  if (paypalOrder.status !== "COMPLETED") throw new CheckoutError("payment_failed");
  return db.transaction(async (tx) => {
    const [paid] = await tx.update(orders)
      .set({
        status: "paid",
        buyerName: paypalOrder.payer?.name ?? paypalOrder.shipTo?.name ?? null,
        buyerEmail: paypalOrder.payer?.email ?? null,
        shipTo: paypalOrder.shipTo,
        paidAt: now,
      })
      .where(and(eq(orders.id, orderRow.id), ne(orders.status, "paid")))
      .returning();
    if (!paid) {
      const [existing] = await tx.select().from(orders).where(eq(orders.id, orderRow.id));
      return existing;
    }
    if (paid.item === "original") {
      await tx.update(paintings)
        .set({ originalStatus: "sold", heldUntil: null, heldByOrderId: null })
        .where(eq(paintings.id, paid.paintingId));
    }
    return paid;
  });
}
