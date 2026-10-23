import { describe, expect, it, vi } from "vitest";
import { createTestDb } from "../db/test-db";
import { paintings, type ShipTo } from "../db/schema";
import { createFakePayPal } from "../paypal/fake";
import { CHECKOUT_MESSAGES } from "./errors";
import { handleCapture, handleCreate, handleShipping } from "./handlers";

const base = {
  slug: "harbor", title: "Harbor", medium: "Watercolor", size: "11x14", year: 2024,
  description: "", imageUrl: "u", imageLargeUrl: "l", imageWidth: 800, imageHeight: 600,
  originalPriceCents: 42000,
};
const ship: ShipTo = { name: "Ann Lee", line1: "1 Central Ave", city: "St. Petersburg", state: "FL", zip: "33701", country: "US" };
const now = new Date("2026-10-22T12:00:00Z");
const generic = { status: 400, body: { code: "payment_failed", message: CHECKOUT_MESSAGES.payment_failed } };

async function setup() {
  const db = await createTestDb();
  const [p] = await db.insert(paintings).values(base).returning();
  return { db, pp: createFakePayPal(), id: p.id };
}

describe("checkout handlers", () => {
  it("rejects malformed bodies with 400 and the generic message", async () => {
    const { db, pp } = await setup();
    expect(await handleCreate(db, pp, null, now)).toEqual(generic);
    expect(await handleCreate(db, pp, { paintingId: "x", item: "poster" }, now)).toEqual(generic);
    expect(await handleShipping(db, pp, { paypalOrderId: "a", country: "US" })).toEqual(generic);
    expect(await handleCapture(db, pp, { paypalOrderId: 5 }, now)).toEqual(generic);
  });

  it("runs create, shipping and capture end to end", async () => {
    const { db, pp, id } = await setup();
    const c = await handleCreate(db, pp, { paintingId: id, item: "original" }, now);
    expect(c.status).toBe(200);
    const { paypalOrderId } = c.body as { paypalOrderId: string };
    const s = await handleShipping(db, pp, { paypalOrderId, country: "US", state: "FL", zip: "33701" });
    expect(s.status).toBe(200);
    pp.approve(paypalOrderId, ship);
    const cap = await handleCapture(db, pp, { paypalOrderId }, now);
    expect(cap.status).toBe(200);
    expect(cap.body).toHaveProperty("orderId");
  });

  it("maps a held painting to 409 and non-US shipping to 422", async () => {
    const { db, pp, id } = await setup();
    const c = await handleCreate(db, pp, { paintingId: id, item: "original" }, now);
    const second = await handleCreate(db, pp, { paintingId: id, item: "original" }, now);
    expect(second.status).toBe(409);
    expect(second.body).toMatchObject({ code: "held" });
    const { paypalOrderId } = c.body as { paypalOrderId: string };
    const s = await handleShipping(db, pp, { paypalOrderId, country: "CA", state: "ON", zip: "M5V" });
    expect(s.status).toBe(422);
    expect(s.body).toMatchObject({ code: "not_us" });
  });

  it("maps unexpected errors to 500 with the generic message and no details", async () => {
    const { db, pp } = await setup();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = await handleCapture(db, { ...pp, getOrder: undefined } as never, { paypalOrderId: "FAKE-ORDER-1" }, now);
    expect(r.status).toBe(409); // unknown order is a CheckoutError('unavailable')
    const boom = await handleCreate({} as never, pp, { paintingId: "x", item: "print" }, now);
    expect(boom).toEqual({ status: 500, body: generic.body });
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});
