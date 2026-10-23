import type { ShipTo } from "@/lib/db/schema";
import type { Amounts, PayPalApi, PayPalEnv, PayPalOrder, PayPalOrderStatus } from "./types";

const STATUSES: PayPalOrderStatus[] = ["CREATED", "APPROVED", "COMPLETED", "VOIDED", "PAYER_ACTION_REQUIRED"];

export class PayPalError extends Error {
  status: number;
  issue: string | null;
  constructor(message: string, status: number, issue: string | null = null) {
    super(message);
    this.name = "PayPalError";
    this.status = status;
    this.issue = issue;
  }
}

const TIMEOUT_MS = 15000;

function dollars(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new RangeError(`invalid cents value: ${cents}`);
  return (cents / 100).toFixed(2);
}

function toCents(value: string | undefined): number {
  return value ? Math.round(parseFloat(value) * 100) : 0;
}

function amountBody(a: Amounts) {
  return {
    currency_code: "USD",
    value: dollars(a.itemCents + a.shippingCents + a.taxCents),
    breakdown: {
      item_total: { currency_code: "USD", value: dollars(a.itemCents) },
      shipping: { currency_code: "USD", value: dollars(a.shippingCents) },
      tax_total: { currency_code: "USD", value: dollars(a.taxCents) },
    },
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapOrder(o: any): PayPalOrder {
  const unit = o.purchase_units?.[0];
  const addr = unit?.shipping?.address;
  const payerName = [o.payer?.name?.given_name, o.payer?.name?.surname].filter(Boolean).join(" ");
  const captured = unit?.payments?.captures?.[0]?.amount?.value;
  const shipTo: ShipTo | null = addr
    ? {
        name: unit.shipping.name?.full_name ?? payerName,
        line1: addr.address_line_1 ?? "",
        ...(addr.address_line_2 ? { line2: addr.address_line_2 } : {}),
        city: addr.admin_area_2 ?? "",
        state: addr.admin_area_1 ?? "",
        zip: addr.postal_code ?? "",
        country: addr.country_code ?? "",
      }
    : null;
  if (!STATUSES.includes(o.status)) {
    throw new PayPalError(`Unexpected PayPal order status`, 200, String(o.status));
  }
  return {
    id: o.id,
    status: o.status,
    totalCents: toCents(unit?.amount?.value ?? captured),
    payer: o.payer?.email_address ? { name: payerName, email: o.payer.email_address } : null,
    shipTo,
  };
}

async function issueOf(res: Response): Promise<string | null> {
  try {
    const b = await res.json();
    const issue = b?.details?.[0]?.issue ?? b?.name;
    return typeof issue === "string" ? issue : null;
  } catch {
    return null;
  }
}

export function createPayPalRest(env: PayPalEnv): PayPalApi {
  const base = env.mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  let token: { value: string; expiresAt: number } | null = null;

  async function getToken(): Promise<string> {
    if (token && Date.now() < token.expiresAt) return token.value;
    const basic = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64");
    const res = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new PayPalError(`PayPal auth failed (${res.status})`, res.status, await issueOf(res));
    const data = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: data.access_token, expiresAt: Date.now() + (data.expires_in - 60) * 1000 };
    return token.value;
  }

  async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await getToken()}`,
        "Content-Type": "application/json",
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new PayPalError(`PayPal ${method} ${path} failed (${res.status})`, res.status, await issueOf(res));
    return res.status === 204 ? null : await res.json();
  }

  return {
    async createOrder(input) {
      const data = await call(
        "POST",
        "/v2/checkout/orders",
        {
          intent: "CAPTURE",
          purchase_units: [
            {
              // PATCH paths address this unit as reference_id 'default', so our own id goes in custom_id.
              reference_id: "default",
              custom_id: input.referenceId,
              description: input.description,
              amount: amountBody(input),
            },
          ],
          payment_source: { paypal: { experience_context: { shipping_preference: "GET_FROM_FILE" } } },
        },
        { "PayPal-Request-Id": input.referenceId },
      );
      return { id: data.id };
    },

    async updateAmounts(id, a) {
      await call("PATCH", `/v2/checkout/orders/${encodeURIComponent(id)}`, [
        { op: "replace", path: "/purchase_units/@reference_id=='default'/amount", value: amountBody(a) },
      ]);
    },

    async captureOrder(id) {
      return mapOrder(await call("POST", `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, undefined, { "PayPal-Request-Id": `capture-${id}` }));
    },

    async getOrder(id) {
      return mapOrder(await call("GET", `/v2/checkout/orders/${encodeURIComponent(id)}`));
    },

    async verifyWebhook(headers, rawBody) {
      let event: unknown;
      try {
        event = JSON.parse(rawBody);
      } catch {
        return false;
      }
      const data = await call("POST", "/v1/notifications/verify-webhook-signature", {
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: env.webhookId,
        webhook_event: event,
      });
      return data?.verification_status === "SUCCESS";
    },
  };
}
