import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../db/test-db";
import { orders, paintings, type ShipTo } from "../db/schema";
import { createFakePayPal } from "../paypal/fake";
import { completeCheckout, startCheckout } from "./service";
import { handleWebhookEvent } from "./webhook";

const base = {
  slug: "harbor", title: "Harbor", medium: "Watercolor", size: "11x14", year: 2024,
  description: "", imageUrl: "u", imageLargeUrl: "l", imageWidth: 800, imageHeight: 600,
  originalPriceCents: 42000,
};
const ship: ShipTo = { name: "Ann Lee", line1: "1 Central Ave", city: "St. Petersburg", state: "FL", zip: "33701", country: "US" };
const now = new Date("2026-10-22T12:00:00Z");
const evt = (orderId: string, type = "PAYMENT.CAPTURE.COMPLETED") => ({
  event_type: type,
  resource: { supplementary_data: { related_ids: { order_id: orderId } } },
});

async function setup() {
  const db = await createTestDb();
  const [p] = await db.insert(paintings).values(base).returning();
  const pp = createFakePayPal();
  const { paypalOrderId } = await startCheckout(db, pp, { paintingId: p.id, item: "original" }, now);
  pp.approve(paypalOrderId, ship);
  return { db, pp, p, paypalOrderId };
}

describe("handleWebhookEvent", () => {
  it("records a paid order when the browser never returned", async () => {
    const { db, pp, p, paypalOrderId } = await setup();
    pp.orders.get(paypalOrderId)!.status = "COMPLETED";
    expect(await handleWebhookEvent(db, pp, evt(paypalOrderId), now)).toBe("recorded");
    const [o] = await db.select().from(orders).where(eq(orders.paypalOrderId, paypalOrderId));
    expect(o.status).toBe("paid");
    const [row] = await db.select().from(paintings).where(eq(paintings.id, p.id));
    expect(row.originalStatus).toBe("sold");
  });

  it("is a no-op after the browser already captured", async () => {
    const { db, pp, paypalOrderId } = await setup();
    await completeCheckout(db, pp, paypalOrderId, now);
    expect(await handleWebhookEvent(db, pp, evt(paypalOrderId), now)).toBe("already-paid");
  });

  it("ignores unknown event types and unknown orders", async () => {
    const { db, pp, paypalOrderId } = await setup();
    expect(await handleWebhookEvent(db, pp, evt(paypalOrderId, "CHECKOUT.ORDER.APPROVED"), now)).toBe("ignored");
    expect(await handleWebhookEvent(db, pp, evt("NOPE"), now)).toBe("ignored");
    expect(await handleWebhookEvent(db, pp, { event_type: "PAYMENT.CAPTURE.COMPLETED", resource: {} }, now)).toBe("ignored");
  });

  it("propagates a non-completed PayPal order so the webhook can be retried", async () => {
    const { db, pp, paypalOrderId } = await setup();
    await expect(handleWebhookEvent(db, pp, evt(paypalOrderId), now)).rejects.toThrow();
  });
});
