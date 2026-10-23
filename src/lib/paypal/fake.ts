import type { ShipTo } from "@/lib/db/schema";
import type { Amounts, PayPalApi, PayPalCaptureStatus, PayPalOrder } from "./types";

/**
 * - declined: the capture call throws and the order stays APPROVED.
 * - timeout-but-completed: the capture succeeds but the call throws.
 * - capture-declined / capture-failed / capture-pending: the call returns 2xx (order COMPLETED)
 *   with that capture-level status.
 */
export type FakeCaptureFailure =
  | "declined" | "timeout-but-completed" | "capture-declined" | "capture-failed" | "capture-pending";

const CAPTURE_OUTCOME: Partial<Record<FakeCaptureFailure, PayPalCaptureStatus>> = {
  "capture-declined": "DECLINED",
  "capture-failed": "FAILED",
  "capture-pending": "PENDING",
};

export type FakePayPal = PayPalApi & {
  orders: Map<string, PayPalOrder>;
  /** Capture attempts per order id (including failed ones). */
  captures: Map<string, number>;
  captureCount(id: string): number;
  approve(id: string, shipTo: ShipTo): void;
  failNextCapture(kind: FakeCaptureFailure): void;
  /** Controls verifyWebhook's result (default true). */
  setWebhookValid(valid: boolean): void;
};

export function createFakePayPal(): FakePayPal {
  const orders = new Map<string, PayPalOrder>();
  const captures = new Map<string, number>();
  let seq = 0;
  let webhookValid = true;
  let nextFailure: FakeCaptureFailure | null = null;

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
      orders.set(id, { id, status: "CREATED", totalCents: total(input), payer: null, shipTo: null, captureStatus: null });
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
      o.captureStatus = (failure && CAPTURE_OUTCOME[failure]) ?? "COMPLETED";
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
