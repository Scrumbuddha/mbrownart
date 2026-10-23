import { describe, expect, it } from "vitest";
import * as capture from "./checkout/capture/route";
import * as webhook from "./paypal/webhook/route";

describe("PayPal route limits", () => {
  it("gives capture and the webhook 60 seconds (PayPal calls can be slow)", () => {
    expect(capture.maxDuration).toBe(60);
    expect(webhook.maxDuration).toBe(60);
  });
});
