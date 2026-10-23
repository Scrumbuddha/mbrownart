import { and, eq, isNull, lt, ne, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { orders, paintings, type Order, type ShipTo } from "../db/schema";
import { getSettings } from "../db/settings";
import { isOriginalPurchasable } from "../paintings/queries";
import type { Amounts, PayPalApi, PayPalOrder } from "../paypal/types";
import { computeTax } from "../tax/florida";
import { CheckoutError } from "./errors";

export const HOLD_MS = 15 * 60 * 1000;
/** A capture claim older than this is treated as abandoned (e.g. the process died mid-capture). */
export const CAPTURE_CLAIM_MS = 2 * 60 * 1000;

const amountsOf = (o: Order): Amounts => ({
  itemCents: o.itemCents, shippingCents: o.shippingCents, taxCents: o.taxCents,
});

async function orderByPayPalId(db: Db, paypalOrderId: string): Promise<Order> {
  const [row] = await db.select().from(orders).where(eq(orders.paypalOrderId, paypalOrderId));
  if (!row) throw new CheckoutError("unavailable");
  return row;
}

async function markFailed(db: Db, orderId: string): Promise<void> {
  await db.update(orders).set({ status: "failed", captureStartedAt: null })
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

/**
 * Atomically marks a capture attempt as started. Only one attempt per order can hold the
 * claim; a claim older than CAPTURE_CLAIM_MS is considered abandoned and can be taken over.
 */
async function claimCapture(db: Db, orderId: string, now: Date): Promise<Order | null> {
  const [row] = await db.update(orders)
    .set({ captureStartedAt: now })
    .where(and(
      eq(orders.id, orderId),
      eq(orders.status, "pending"),
      or(isNull(orders.captureStartedAt), lt(orders.captureStartedAt, new Date(now.getTime() - CAPTURE_CLAIM_MS))),
    ))
    .returning();
  return row ?? null;
}

/**
 * Ends a capture attempt that did not pay, so a retry or the webhook can proceed. Keyed to the
 * attempt's own claim, so a stale attempt never clears a newer attempt's claim.
 */
async function releaseCapture(db: Db, orderId: string, claim: Date): Promise<void> {
  await db.update(orders).set({ captureStartedAt: null })
    .where(and(eq(orders.id, orderId), ne(orders.status, "paid"), eq(orders.captureStartedAt, claim)));
}

/** Gives up on this order: frees the painting for the next checkout and marks the order failed. */
async function abandon(db: Db, o: Order): Promise<void> {
  await releaseHold(db, o.paintingId, o.id);
  await markFailed(db, o.id);
}

/** Why an original can't be (re)held: someone else's live hold, or it is no longer for sale. */
async function holdRefusal(db: Db, paintingId: string, now: Date): Promise<CheckoutError> {
  const [p] = await db.select().from(paintings).where(eq(paintings.id, paintingId));
  const heldByOther = p?.originalStatus === "for_sale" && p.heldUntil !== null && p.heldUntil >= now;
  return new CheckoutError(heldByOther ? "held" : "sold");
}

/**
 * Recomputes tax from the order's locked amounts and saves it, but only while the order is
 * pending and `claim` matches (null = no capture in flight; a Date = our own capture claim).
 * Throws `in_progress` if the order is no longer writable.
 */
async function saveTax(db: Db, o: Order, state: string, zip: string, claim: Date | null): Promise<Order> {
  const { taxEnabled } = await getSettings(db);
  const { taxCents, county } = computeTax({
    state, zip, itemCents: o.itemCents, shippingCents: o.shippingCents, enabled: taxEnabled,
  });
  const [row] = await db.update(orders)
    .set({ taxCents, taxCounty: county, totalCents: o.itemCents + o.shippingCents + taxCents })
    .where(and(
      eq(orders.id, o.id),
      eq(orders.status, "pending"),
      claim ? eq(orders.captureStartedAt, claim) : isNull(orders.captureStartedAt),
    ))
    .returning();
  if (!row) throw new CheckoutError("in_progress");
  return row;
}

async function pushAmounts(pp: PayPalApi, paypalOrderId: string, a: Amounts): Promise<void> {
  try {
    await pp.updateAmounts(paypalOrderId, a);
  } catch {
    throw new CheckoutError("payment_failed");
  }
}

async function fetchPayPalOrder(pp: PayPalApi, paypalOrderId: string): Promise<PayPalOrder> {
  try {
    return await pp.getOrder(paypalOrderId);
  } catch {
    throw new CheckoutError("payment_failed");
  }
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
    await abandon(db, o);
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
  const amounts = amountsOf(await saveTax(db, o, input.state, input.zip, null));
  await pushAmounts(pp, input.paypalOrderId, amounts);
  return amounts;
}

export async function completeCheckout(
  db: Db,
  pp: PayPalApi,
  paypalOrderId: string,
  now: Date,
): Promise<Order> {
  const current = await orderByPayPalId(db, paypalOrderId);
  if (current.status === "paid") return current;
  if (current.status !== "pending") throw new CheckoutError("payment_failed");

  const claimed = await claimCapture(db, current.id, now);
  if (!claimed) {
    const [again] = await db.select().from(orders).where(eq(orders.id, current.id));
    if (again.status === "paid") return again;
    if (again.status === "failed") throw new CheckoutError("payment_failed");
    throw new CheckoutError("in_progress");
  }

  try {
    return await captureClaimed(db, pp, claimed, paypalOrderId, now);
  } catch (e) {
    // Any attempt that ends without paying gives its own claim back (no-op once paid).
    await releaseCapture(db, claimed.id, claimed.captureStartedAt!);
    throw e;
  }
}

async function captureClaimed(
  db: Db,
  pp: PayPalApi,
  claimed: Order,
  paypalOrderId: string,
  now: Date,
): Promise<Order> {
  // Price the order from PayPal's ship-to; never trust the browser's earlier updateShipping.
  const ppOrder = await fetchPayPalOrder(pp, paypalOrderId);
  const shipTo: ShipTo | null = ppOrder.shipTo;
  if (!shipTo || shipTo.country.trim().toUpperCase() !== "US") {
    // Nothing to capture: free the painting so the buyer can retry straight away.
    await releaseHold(db, claimed.paintingId, claimed.id);
    throw new CheckoutError(shipTo ? "not_us" : "amount_mismatch");
  }
  const o = await saveTax(db, claimed, shipTo.state, shipTo.zip, claimed.captureStartedAt);

  // An original must still be for sale and not held by someone else; (re)take the hold so no
  // new checkout can start while we capture.
  if (o.item === "original" && !(await claimHold(db, o.paintingId, o.id, now))) {
    await markFailed(db, o.id);
    throw await holdRefusal(db, o.paintingId, now);
  }

  // Never charge a total the buyer did not approve (e.g. Florida tax added after the shipping
  // callback didn't fire). End this order; the buyer reviews the new total and pays again.
  if (ppOrder.totalCents !== o.totalCents) {
    await abandon(db, o);
    throw new CheckoutError("total_changed");
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
    await abandon(db, o);
    throw new CheckoutError("payment_failed");
  }
  return recordPaidOrder(db, captured, o, now);
}

/**
 * Marks the order paid (the money was taken, so this always happens) and, for an original,
 * marks the painting sold if it was still ours to sell. Otherwise flags the order
 * `sold_twice`; a captured total that differs from ours is flagged `amount_mismatch`.
 * Idempotent; shared with the webhook.
 */
export async function recordPaidOrder(
  db: Db,
  paypalOrder: PayPalOrder,
  orderRow: Order,
  now: Date,
): Promise<Order> {
  if (paypalOrder.id !== orderRow.paypalOrderId) {
    throw new Error(`PayPal order ${paypalOrder.id} does not belong to order ${orderRow.id}`);
  }
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

    let attention: Order["attention"] = paypalOrder.totalCents !== paid.totalCents ? "amount_mismatch" : null;
    if (paid.item === "original") {
      const sold = await tx.update(paintings)
        .set({ originalStatus: "sold", heldUntil: null, heldByOrderId: null })
        .where(and(
          eq(paintings.id, paid.paintingId),
          eq(paintings.originalStatus, "for_sale"),
          or(isNull(paintings.heldByOrderId), eq(paintings.heldByOrderId, paid.id), lt(paintings.heldUntil, now)),
        ))
        .returning({ id: paintings.id });
      // sold_twice is the more serious problem, so it wins over amount_mismatch.
      if (sold.length === 0) attention = "sold_twice";
    }
    if (!attention) return paid;
    const [flagged] = await tx.update(orders).set({ attention }).where(eq(orders.id, paid.id)).returning();
    return flagged;
  });
}
