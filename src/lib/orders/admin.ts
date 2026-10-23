import { and, desc, eq, isNull, notInArray, or, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { orders, paintings, type Order } from "../db/schema";
import { NO_SHIP_ATTENTION } from "./attention";

export type PaidOrder = Order & { paintingTitle: string };

/** Paid orders, newest first. Pending and failed orders are never listed. */
export async function listPaidOrders(db: Db): Promise<PaidOrder[]> {
  const rows = await db
    .select({ order: orders, paintingTitle: paintings.title })
    .from(orders)
    .innerJoin(paintings, eq(orders.paintingId, paintings.id))
    .where(eq(orders.status, "paid"))
    .orderBy(sql`${orders.paidAt} desc nulls last`, desc(orders.createdAt));
  return rows.map((r) => ({ ...r.order, paintingTitle: r.paintingTitle }));
}

// Mirrors canShip in attention.ts: no refund owed, PayPal has cleared the money, not a sandbox test.
const shippable = and(
  or(isNull(orders.attention), notInArray(orders.attention, [...NO_SHIP_ATTENTION])),
  eq(orders.paypalEnv, "live"),
);

/**
 * Marks a paid order shipped, then calls `send` and records shippedEmailSentAt when it succeeds.
 * Does nothing if it is already shipped, not paid, or not shippable (see canShip). If `send` throws,
 * shippedAt stays set (shippedEmailSentAt stays null) and the error propagates.
 */
export async function markShipped(
  db: Db, orderId: string, now: Date, send: (o: Order) => Promise<void>,
): Promise<void> {
  const [order] = await db.update(orders).set({ shippedAt: now })
    .where(and(eq(orders.id, orderId), eq(orders.status, "paid"), isNull(orders.shippedAt), shippable))
    .returning();
  if (!order) return;
  await send(order);
  await db.update(orders).set({ shippedEmailSentAt: now }).where(eq(orders.id, orderId));
}

/**
 * Re-sends the shipped email for a shipped order whose email never went out. The claim is a
 * conditional update, so a double click sends once. If `send` throws the claim is released.
 */
export async function resendShippedEmail(
  db: Db, orderId: string, now: Date, send: (o: Order) => Promise<void>,
): Promise<void> {
  const [order] = await db.update(orders).set({ shippedEmailSentAt: now })
    .where(and(
      eq(orders.id, orderId), eq(orders.status, "paid"),
      sql`${orders.shippedAt} is not null`, isNull(orders.shippedEmailSentAt), shippable,
    ))
    .returning();
  if (!order) return;
  try {
    await send(order);
  } catch (e) {
    await db.update(orders).set({ shippedEmailSentAt: null }).where(eq(orders.id, orderId));
    throw e;
  }
}
