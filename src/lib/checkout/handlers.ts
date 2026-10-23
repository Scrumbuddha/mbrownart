import type { Db } from "../db/client";
import type { PayPalApi } from "../paypal/types";
import { CHECKOUT_MESSAGES, CheckoutError } from "./errors";
import { completeCheckout, startCheckout, updateShipping } from "./service";

export type HandlerResult = { status: number; body: unknown };

const GENERIC: HandlerResult = {
  status: 400,
  body: { code: "payment_failed", message: CHECKOUT_MESSAGES.payment_failed },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 200;

/** Maps a thrown error to an HTTP result. Logs only the error name and code, never PII. */
export function errorResult(e: unknown): HandlerResult {
  if (e instanceof CheckoutError) {
    const status = e.code === "not_us" ? 422 : 409;
    return { status, body: { code: e.code, message: e.message } };
  }
  console.error("checkout error:", e instanceof Error ? e.name : "unknown");
  return { status: 500, body: { code: "payment_failed", message: CHECKOUT_MESSAGES.payment_failed } };
}

async function guard(fn: () => Promise<HandlerResult>): Promise<HandlerResult> {
  try {
    return await fn();
  } catch (e) {
    return errorResult(e);
  }
}

export function handleCreate(db: Db, pp: PayPalApi, body: unknown, now: Date): Promise<HandlerResult> {
  if (!isObj(body) || !str(body.paintingId) || (body.item !== "original" && body.item !== "print")) {
    return Promise.resolve(GENERIC);
  }
  const input: { paintingId: string; item: "original" | "print" } = { paintingId: body.paintingId, item: body.item };
  return guard(async () => ({ status: 200, body: await startCheckout(db, pp, input, now) }));
}

export function handleShipping(db: Db, pp: PayPalApi, body: unknown): Promise<HandlerResult> {
  if (!isObj(body) || !str(body.paypalOrderId) || !str(body.country)) return Promise.resolve(GENERIC);
  // Check the country first, so a non-US address with no state or zip still gets not_us.
  if (body.country.trim().toUpperCase() !== "US") return Promise.resolve(errorResult(new CheckoutError("not_us")));
  if (!str(body.state) || !str(body.zip)) return Promise.resolve(GENERIC);
  const input = { paypalOrderId: body.paypalOrderId, country: body.country, state: body.state, zip: body.zip };
  return guard(async () => ({ status: 200, body: await updateShipping(db, pp, input) }));
}

export function handleCapture(db: Db, pp: PayPalApi, body: unknown, now: Date): Promise<HandlerResult> {
  if (!isObj(body) || !str(body.paypalOrderId)) return Promise.resolve(GENERIC);
  const id = body.paypalOrderId;
  return guard(async () => ({ status: 200, body: { orderId: (await completeCheckout(db, pp, id, now)).id } }));
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
