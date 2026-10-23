"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { PayPalButtons, PayPalScriptProvider } from "@paypal/react-paypal-js";
import type { PayPalButtonsComponentProps } from "@paypal/react-paypal-js";
import { CHECKOUT_MESSAGES } from "@/lib/checkout/errors";

export type BuyItem = "original" | "print";

export type BuyOption = {
  item: BuyItem;
  label: string;
  /** Display text only ("$420" or "Sold"); the server prices every order itself. */
  price: string;
  disabled: boolean;
};

type ErrorBody = { code?: string; message?: string };

/** PayPal documents `data.errors` and `actions.reject(message)`; the bundled types omit both. */
type ShippingErrors = { COUNTRY_ERROR?: string; ADDRESS_ERROR?: string };

async function post(url: string, body: unknown): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, status: res.status, body: json };
}

const messageOf = (body: ErrorBody): string =>
  typeof body.message === "string" && body.message ? body.message : CHECKOUT_MESSAGES.payment_failed;

export function BuyBox({ paintingId, options }: { paintingId: string; options: BuyOption[] }) {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const router = useRouter();
  const firstOpen = options.find((o) => !o.disabled)?.item ?? null;
  const [item, setItem] = useState<BuyItem | null>(firstOpen);
  const [error, setError] = useState<string | null>(null);
  // PayPal keeps the callbacks it was rendered with, so read the live choice from refs.
  const itemRef = useRef(item);
  const orderRef = useRef<string | null>(null);
  const shownError = useRef(false);

  const fail = (message: string) => {
    shownError.current = true;
    setError(message);
  };

  const choose = (next: BuyItem) => {
    itemRef.current = next;
    setItem(next);
    setError(null);
  };

  const createOrder: PayPalButtonsComponentProps["createOrder"] = async () => {
    setError(null);
    shownError.current = false;
    const r = await post("/api/checkout/create", { paintingId, item: itemRef.current });
    const id = r.body.paypalOrderId;
    if (!r.ok || typeof id !== "string") {
      fail(messageOf(r.body));
      throw new Error("create failed");
    }
    orderRef.current = id;
    return id;
  };

  const onShippingAddressChange: PayPalButtonsComponentProps["onShippingAddressChange"] = async (data, actions) => {
    const errors = (data as { errors?: ShippingErrors }).errors ?? {};
    const reject = actions.reject as (message?: string) => Promise<void>;
    const a = data.shippingAddress;
    const r = await post("/api/checkout/shipping", {
      paypalOrderId: data.orderID ?? orderRef.current,
      country: a.countryCode,
      state: a.state,
      zip: a.postalCode,
    });
    if (r.ok) return;
    fail(messageOf(r.body));
    return reject(r.status === 422 ? errors.COUNTRY_ERROR : errors.ADDRESS_ERROR);
  };

  const onApprove: PayPalButtonsComponentProps["onApprove"] = async (data) => {
    const r = await post("/api/checkout/capture", { paypalOrderId: data.orderID });
    const orderId = r.body.orderId;
    if (r.ok && typeof orderId === "string") {
      router.push(`/thank-you?order=${encodeURIComponent(orderId)}`);
      return;
    }
    // Includes 409 in_progress: show the message and stay on the page.
    fail(messageOf(r.body));
  };

  const onError: PayPalButtonsComponentProps["onError"] = () => {
    // Keep a specific server message if one is already showing.
    if (!shownError.current) fail(CHECKOUT_MESSAGES.payment_failed);
  };

  const buttons = { createOrder, onShippingAddressChange, onApprove, onError, disabled: item === null };

  return (
    <div className="buy-box">
      <fieldset className="buy-options">
        <legend className="visually-hidden">Choose what to buy</legend>
        {options.map((o) => (
          <label key={o.item} className={`buy-option${o.disabled ? " is-disabled" : ""}`}>
            <span className="buy-option-label">
              <input
                type="radio"
                name="item"
                value={o.item}
                checked={item === o.item}
                disabled={o.disabled}
                onChange={() => choose(o.item)}
              />
              {o.label}
            </span>
            <span className={o.disabled ? "sold" : undefined}>{o.price}</span>
          </label>
        ))}
      </fieldset>

      {error ? <p className="buy-error" role="alert">{error}</p> : null}

      <div className="buy-buttons">
        {clientId ? (
          <PayPalScriptProvider
            options={{
              clientId,
              currency: "USD",
              intent: "capture",
              components: "buttons",
              enableFunding: "card",
            }}
          >
            <PayPalButtons fundingSource="paypal" style={{ layout: "vertical" }} {...buttons} />
            <PayPalButtons fundingSource="card" style={{ layout: "vertical" }} {...buttons} />
          </PayPalScriptProvider>
        ) : (
          <p className="buy-note">Online checkout isn&apos;t available right now. Please use the Contact page.</p>
        )}
      </div>
    </div>
  );
}
