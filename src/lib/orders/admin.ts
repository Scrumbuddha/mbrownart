import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { orders, paintings, type Order } from "../db/schema";

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

/**
 * Marks a paid order shipped, then calls `send`. Does nothing if it is already shipped
 * (or not a paid order). If `send` throws, shippedAt stays set and the error propagates.
 */
export async function markShipped(
  db: Db, orderId: string, now: Date, send: (o: Order) => Promise<void>,
): Promise<void> {
  const [order] = await db.update(orders).set({ shippedAt: now })
    .where(and(eq(orders.id, orderId), eq(orders.status, "paid"), isNull(orders.shippedAt)))
    .returning();
  if (!order) return;
  await send(order);
}
