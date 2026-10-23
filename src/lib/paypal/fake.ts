import type { ShipTo } from "@/lib/db/schema";
import type { Amounts, PayPalApi, PayPalOrder } from "./types";

export type FakePayPal = PayPalApi & {
  orders: Map<string, PayPalOrder>;
  /** Capture attempts per order id (including failed ones). */
  captures: Map<string, number>;
  captureCount(id: string): number;
  approve(id: string, shipTo: ShipTo): void;
  failNextCapture(kind: "declined" | "timeout-but-completed"): void;
  /** Controls verifyWebhook's result (default true). */
  setWebhookValid(valid: boolean): void;
};

export function createFakePayPal(): FakePayPal {
  const orders = new Map<string, PayPalOrder>();
  const captures = new Map<string, number>();
  let seq = 0;
  let webhookValid = true;
  let nextFailure: "declined" | "timeout-but-completed" | null = null;

  const get = (id: string) => {
    const o = orders.get(id);
    if (!o) throw new Error(`unknown PayPal order ${id}`);
    return o;
  };
  const total = (a: Amounts) => a.itemCents + a.shippingCents + a.taxCents;

  return {
    orders,
    captures,
    captureCount: (id) => captures.get(id) ?? 0,

    async createOrder(input) {
      const id = `FAKE-ORDER-${++seq}`;
      orders.set(id, { id, status: "CREATED", totalCents: total(input), payer: null, shipTo: null });
      return { id };
    },

    async updateAmounts(id, a) {
      get(id).totalCents = total(a);
    },

    async captureOrder(id) {
      const o = get(id);
      captures.set(id, (captures.get(id) ?? 0) + 1);
      if (o.status !== "APPROVED") throw new Error(`order ${id} is ${o.status}, not APPROVED`);
      const failure = nextFailure;
      nextFailure = null;
      if (failure === "declined") throw new Error("declined");
      o.status = "COMPLETED";
      if (failure === "timeout-but-completed") throw new Error("timeout");
      return { ...o };
    },

    async getOrder(id) {
      return { ...get(id) };
    },

    async verifyWebhook() {
      return webhookValid;
    },

    setWebhookValid(valid) {
      webhookValid = valid;
    },

    approve(id, shipTo) {
      const o = get(id);
      if (o.status === "COMPLETED") throw new Error(`order ${id} is already COMPLETED`);
      o.status = "APPROVED";
      o.payer = { name: shipTo.name, email: "buyer@example.com" };
      o.shipTo = shipTo;
    },

    failNextCapture(kind) {
      nextFailure = kind;
    },
  };
}
