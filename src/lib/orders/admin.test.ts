import { describe, expect, it, vi } from "vitest";
import { orders, paintings } from "../db/schema";
import { createTestDb } from "../db/test-db";
import { listPaidOrders, markShipped, resendShippedEmail } from "./admin";

async function setup() {
  const db = await createTestDb();
  const [p] = await db.insert(paintings).values({
    slug: "harbor", title: "Harbor Light", medium: "w", size: "8x10", year: 2024, description: "",
    imageUrl: "w", imageLargeUrl: "l", imageWidth: 1, imageHeight: 1,
  }).returning();
  const add = async (over: Partial<typeof orders.$inferInsert> = {}) => {
    const [o] = await db.insert(orders).values({
      paintingId: p.id, item: "original", status: "paid", itemCents: 42000, shippingCents: 1000,
      totalCents: 43000, paidAt: new Date("2026-11-03T15:00:00Z"), ...over,
    }).returning();
    return o;
  };
  return { db, add };
}

describe("listPaidOrders", () => {
  it("excludes pending and failed orders and lists newest first with the title", async () => {
    const { db, add } = await setup();
    await add({ status: "pending", paidAt: null });
    await add({ status: "failed", paidAt: null });
    const old = await add({ paidAt: new Date("2026-11-01T15:00:00Z") });
    const recent = await add({ paidAt: new Date("2026-11-05T15:00:00Z") });
    const rows = await listPaidOrders(db);
    expect(rows.map((r) => r.id)).toEqual([recent.id, old.id]);
    expect(rows[0].paintingTitle).toBe("Harbor Light");
  });

  it("returns attention so the page can flag the order", async () => {
    const { db, add } = await setup();
    await add({ attention: "sold_twice" });
    await add({ attention: null });
    const rows = await listPaidOrders(db);
    expect(rows.map((r) => r.attention).sort()).toEqual([null, "sold_twice"]);
  });
});

describe("markShipped", () => {
  it("sets shippedAt and sends exactly once even when called twice", async () => {
    const { db, add } = await setup();
    const o = await add();
    const send = vi.fn().mockResolvedValue(undefined);
    const now = new Date("2026-11-06T12:00:00Z");
    await markShipped(db, o.id, now, send);
    await markShipped(db, o.id, new Date("2026-11-07T12:00:00Z"), send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ id: o.id });
    expect((await listPaidOrders(db))[0].shippedAt).toEqual(now);
  });

  it("keeps shippedAt set when the email fails, and does not resend", async () => {
    const { db, add } = await setup();
    const o = await add();
    const send = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(markShipped(db, o.id, new Date("2026-11-06T12:00:00Z"), send)).rejects.toThrow("boom");
    expect((await listPaidOrders(db))[0].shippedAt).not.toBeNull();
    await markShipped(db, o.id, new Date(), send);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("ignores orders that are not paid", async () => {
    const { db, add } = await setup();
    const o = await add({ status: "pending", paidAt: null });
    const send = vi.fn();
    await markShipped(db, o.id, new Date(), send);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("markShipped email outcome and sold_twice", () => {
  it("records shippedEmailSentAt only when send succeeds", async () => {
    const { db, add } = await setup();
    const ok = await add();
    const bad = await add();
    const now = new Date("2026-11-06T12:00:00Z");
    await markShipped(db, ok.id, now, async () => {});
    await expect(markShipped(db, bad.id, now, async () => { throw new Error("x"); })).rejects.toThrow();
    const rows = await listPaidOrders(db);
    expect(rows.find((r) => r.id === ok.id)!.shippedEmailSentAt).toEqual(now);
    expect(rows.find((r) => r.id === bad.id)!.shippedEmailSentAt).toBeNull();
  });

  it("refuses to ship a sold_twice order, but ships amount_mismatch", async () => {
    const { db, add } = await setup();
    const twice = await add({ attention: "sold_twice" });
    const mismatch = await add({ attention: "amount_mismatch" });
    const send = vi.fn().mockResolvedValue(undefined);
    await markShipped(db, twice.id, new Date(), send);
    expect(send).not.toHaveBeenCalled();
    await markShipped(db, mismatch.id, new Date(), send);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await listPaidOrders(db)).find((r) => r.id === twice.id)!.shippedAt).toBeNull();
  });
});

describe("resendShippedEmail", () => {
  it("sends and records the time after an earlier failure", async () => {
    const { db, add } = await setup();
    const o = await add();
    await expect(markShipped(db, o.id, new Date(), async () => { throw new Error("x"); })).rejects.toThrow();
    const send = vi.fn().mockResolvedValue(undefined);
    const now = new Date("2026-11-07T12:00:00Z");
    await resendShippedEmail(db, o.id, now, send);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await listPaidOrders(db))[0].shippedEmailSentAt).toEqual(now);
  });

  it("sends once when called twice at the same time", async () => {
    const { db, add } = await setup();
    const o = await add();
    await expect(markShipped(db, o.id, new Date(), async () => { throw new Error("x"); })).rejects.toThrow();
    const send = vi.fn().mockResolvedValue(undefined);
    await Promise.all([
      resendShippedEmail(db, o.id, new Date(), send),
      resendShippedEmail(db, o.id, new Date(), send),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an already-emailed or unshipped order, and stays retryable if send fails", async () => {
    const { db, add } = await setup();
    const sent = await add();
    await markShipped(db, sent.id, new Date(), async () => {});
    const unshipped = await add();
    const send = vi.fn().mockResolvedValue(undefined);
    await resendShippedEmail(db, sent.id, new Date(), send);
    await resendShippedEmail(db, unshipped.id, new Date(), send);
    expect(send).not.toHaveBeenCalled();

    const failing = await add();
    await expect(markShipped(db, failing.id, new Date(), async () => { throw new Error("x"); })).rejects.toThrow();
    await expect(resendShippedEmail(db, failing.id, new Date(), async () => { throw new Error("y"); })).rejects.toThrow();
    expect((await listPaidOrders(db)).find((r) => r.id === failing.id)!.shippedEmailSentAt).toBeNull();
    await resendShippedEmail(db, failing.id, new Date(), send);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
