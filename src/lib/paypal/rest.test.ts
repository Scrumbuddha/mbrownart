import { afterEach, describe, expect, it, vi } from "vitest";
import { createPayPalRest } from "./rest";

const env = { clientId: "id", clientSecret: "secret", mode: "sandbox" as const, webhookId: "WH-1" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function mockFetch(routes: (url: string, init: RequestInit) => Response) {
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (u.endsWith("/v1/oauth2/token")) return json({ access_token: "tok", expires_in: 32400 });
    return routes(u, init ?? {});
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe("createPayPalRest", () => {
  it("createOrder sends a breakdown that sums to the total", async () => {
    const fn = mockFetch(() => json({ id: "ORD1" }));
    const res = await createPayPalRest(env).createOrder({
      referenceId: "ref-1", description: "Painting", itemCents: 42000, shippingCents: 1000, taxCents: 0,
    });
    expect(res).toEqual({ id: "ORD1" });
    const call = fn.mock.calls.find(([u]) => String(u).endsWith("/v2/checkout/orders"))!;
    expect(String(call[0])).toBe("https://api-m.sandbox.paypal.com/v2/checkout/orders");
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string>)["PayPal-Request-Id"]).toMatch(/^[0-9a-f-]{36}$/);
    const body = JSON.parse(init.body as string);
    expect(body.intent).toBe("CAPTURE");
    expect(body.payment_source.paypal.experience_context.shipping_preference).toBe("GET_FROM_FILE");
    const amount = body.purchase_units[0].amount;
    expect(amount.currency_code).toBe("USD");
    expect(amount.value).toBe("430.00");
    expect(amount.breakdown.item_total.value).toBe("420.00");
    expect(amount.breakdown.shipping.value).toBe("10.00");
    expect(amount.breakdown.tax_total.value).toBe("0.00");
  });

  it("fetches the token once across two calls", async () => {
    const fn = mockFetch(() => json({ id: "ORD1" }));
    const api = createPayPalRest(env);
    const input = { referenceId: "r", description: "d", itemCents: 100, shippingCents: 0, taxCents: 0 };
    await api.createOrder(input);
    await api.createOrder(input);
    expect(fn.mock.calls.filter(([u]) => String(u).endsWith("/v1/oauth2/token"))).toHaveLength(1);
  });

  it("uses the live base URL in live mode", async () => {
    const fn = mockFetch(() => json({ id: "X" }));
    await createPayPalRest({ ...env, mode: "live" }).createOrder({
      referenceId: "r", description: "d", itemCents: 100, shippingCents: 0, taxCents: 0,
    });
    expect(String(fn.mock.calls[0][0])).toBe("https://api-m.paypal.com/v1/oauth2/token");
  });

  it("getOrder maps shipping address, payer and total", async () => {
    mockFetch(() =>
      json({
        id: "ORD1",
        status: "APPROVED",
        payer: { name: { given_name: "Ann", surname: "Lee" }, email_address: "ann@example.com" },
        purchase_units: [
          {
            amount: { currency_code: "USD", value: "430.00" },
            shipping: {
              name: { full_name: "Ann Lee" },
              address: {
                address_line_1: "1 Main St", address_line_2: "Apt 2", admin_area_2: "Tampa",
                admin_area_1: "FL", postal_code: "33601", country_code: "US",
              },
            },
          },
        ],
      }),
    );
    const o = await createPayPalRest(env).getOrder("ORD1");
    expect(o).toEqual({
      id: "ORD1",
      status: "APPROVED",
      totalCents: 43000,
      payer: { name: "Ann Lee", email: "ann@example.com" },
      shipTo: { name: "Ann Lee", line1: "1 Main St", line2: "Apt 2", city: "Tampa", state: "FL", zip: "33601", country: "US" },
    });
  });

  it("updateAmounts PATCHes the default purchase unit amount", async () => {
    const fn = mockFetch(() => new Response(null, { status: 204 }));
    await createPayPalRest(env).updateAmounts("ORD1", { itemCents: 42000, shippingCents: 1000, taxCents: 2940 });
    const call = fn.mock.calls.find(([u]) => String(u).endsWith("/v2/checkout/orders/ORD1"))!;
    const init = call[1] as RequestInit;
    expect(init.method).toBe("PATCH");
    const ops = JSON.parse(init.body as string);
    expect(ops[0].op).toBe("replace");
    expect(ops[0].path).toBe("/purchase_units/@reference_id=='default'/amount");
    expect(ops[0].value.value).toBe("459.40");
    expect(ops[0].value.breakdown.tax_total.value).toBe("29.40");
  });

  it("captureOrder posts with a request id and returns the mapped order", async () => {
    const fn = mockFetch(() =>
      json({ id: "ORD1", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ amount: { value: "430.00" } }] } }] }),
    );
    const o = await createPayPalRest(env).captureOrder("ORD1");
    expect(o.status).toBe("COMPLETED");
    expect(o.totalCents).toBe(43000);
    const init = fn.mock.calls.find(([u]) => String(u).endsWith("/ORD1/capture"))![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["PayPal-Request-Id"]).toBeTruthy();
  });

  it("verifyWebhook returns true only on SUCCESS", async () => {
    let status = "SUCCESS";
    const fn = mockFetch(() => json({ verification_status: status }));
    const api = createPayPalRest(env);
    const headers = new Headers({
      "paypal-auth-algo": "SHA256withRSA", "paypal-cert-url": "https://x", "paypal-transmission-id": "t1",
      "paypal-transmission-sig": "sig", "paypal-transmission-time": "now",
    });
    expect(await api.verifyWebhook(headers, '{"id":"EV1"}')).toBe(true);
    const body = JSON.parse((fn.mock.calls.at(-1)![1] as RequestInit).body as string);
    expect(body.webhook_id).toBe("WH-1");
    expect(body.transmission_id).toBe("t1");
    expect(body.webhook_event).toEqual({ id: "EV1" });
    status = "FAILURE";
    expect(await api.verifyWebhook(headers, '{"id":"EV1"}')).toBe(false);
  });

  it("throws without leaking the secret on API errors", async () => {
    mockFetch(() => json({ name: "UNPROCESSABLE" }, 422));
    const err = await createPayPalRest(env).getOrder("ORD1").catch((e: Error) => e);
    expect((err as Error).message).toMatch(/422/);
    expect((err as Error).message).not.toContain("secret");
  });
});
