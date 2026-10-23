import { describe, expect, it } from "vitest";
import { createFakePayPal } from "./fake";
import type { ShipTo } from "@/lib/db/schema";

const shipTo: ShipTo = { name: "Ann Lee", line1: "1 Main St", city: "Tampa", state: "FL", zip: "33601", country: "US" };
const input = { referenceId: "r", description: "d", itemCents: 42000, shippingCents: 1000, taxCents: 0 };

async function approved() {
  const p = createFakePayPal();
  const { id } = await p.createOrder(input);
  p.approve(id, shipTo);
  return { p, id };
}

describe("createFakePayPal", () => {
  it("createOrder yields CREATED with the totals", async () => {
    const p = createFakePayPal();
    const { id } = await p.createOrder(input);
    expect(await p.getOrder(id)).toEqual({
      id, status: "CREATED", totalCents: 43000, payer: null, shipTo: null, captureStatus: null,
    });
  });

  it("a normal capture reports captureStatus COMPLETED", async () => {
    const { p, id } = await approved();
    expect((await p.captureOrder(id)).captureStatus).toBe("COMPLETED");
  });

  it("capture-declined / capture-failed / capture-pending return 2xx with that capture status", async () => {
    for (const [kind, status] of [
      ["capture-declined", "DECLINED"], ["capture-failed", "FAILED"], ["capture-pending", "PENDING"],
    ] as const) {
      const { p, id } = await approved();
      p.failNextCapture(kind);
      const o = await p.captureOrder(id);
      expect(o).toMatchObject({ status: "COMPLETED", captureStatus: status });
      expect((await p.getOrder(id)).captureStatus).toBe(status);
    }
  });

  it("approve sets APPROVED with payer and shipTo", async () => {
    const { p, id } = await approved();
    const o = await p.getOrder(id);
    expect(o.status).toBe("APPROVED");
    expect(o.shipTo).toEqual(shipTo);
    expect(o.payer?.name).toBe("Ann Lee");
    expect(o.payer?.email).toBeTruthy();
  });

  it("capture completes and is counted", async () => {
    const { p, id } = await approved();
    expect((await p.captureOrder(id)).status).toBe("COMPLETED");
    expect(p.captureCount(id)).toBe(1);
  });

  it("capture of an unapproved order throws", async () => {
    const p = createFakePayPal();
    const { id } = await p.createOrder(input);
    await expect(p.captureOrder(id)).rejects.toThrow();
  });

  it("declined leaves the order APPROVED and throws", async () => {
    const { p, id } = await approved();
    p.failNextCapture("declined");
    await expect(p.captureOrder(id)).rejects.toThrow("declined");
    expect((await p.getOrder(id)).status).toBe("APPROVED");
    expect(p.captureCount(id)).toBe(1);
  });

  it("timeout-but-completed leaves the order COMPLETED and throws", async () => {
    const { p, id } = await approved();
    p.failNextCapture("timeout-but-completed");
    await expect(p.captureOrder(id)).rejects.toThrow("timeout");
    expect((await p.getOrder(id)).status).toBe("COMPLETED");
  });

  it("timeout-but-completed on an unapproved order throws without completing it", async () => {
    const p = createFakePayPal();
    const { id } = await p.createOrder(input);
    p.failNextCapture("timeout-but-completed");
    await expect(p.captureOrder(id)).rejects.toThrow("not APPROVED");
    expect((await p.getOrder(id)).status).toBe("CREATED");
  });

  it("approve refuses a COMPLETED order", async () => {
    const { p, id } = await approved();
    await p.captureOrder(id);
    expect(() => p.approve(id, shipTo)).toThrow();
  });

  it("updateAmounts changes totalCents", async () => {
    const p = createFakePayPal();
    const { id } = await p.createOrder(input);
    await p.updateAmounts(id, { itemCents: 42000, shippingCents: 1000, taxCents: 2940 });
    expect((await p.getOrder(id)).totalCents).toBe(45940);
  });

  it("verifyWebhook follows setWebhookValid", async () => {
    const p = createFakePayPal();
    expect(await p.verifyWebhook(new Headers(), "{}")).toBe(true);
    p.setWebhookValid(false);
    expect(await p.verifyWebhook(new Headers(), "{}")).toBe(false);
  });
});
