// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { CHECKOUT_MESSAGES } from "@/lib/checkout/errors";

const { push, buttonProps } = vi.hoisted(() => ({
  push: vi.fn(),
  buttonProps: [] as Array<{ onApprove: (data: { orderID: string }) => Promise<void> }>,
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@paypal/react-paypal-js", () => ({
  PayPalScriptProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="paypal">{children}</div>,
  PayPalButtons: (props: (typeof buttonProps)[number]) => {
    buttonProps.push(props);
    return null;
  },
}));

import { BuyBox } from "./BuyBox";

const options = [{ item: "original" as const, label: "Original (one of a kind)", price: "$420", disabled: false }];

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  push.mockReset();
  buttonProps.length = 0;
});

/** Renders with PayPal loaded and approves, with the capture endpoint answering `code`. */
async function approveWithCaptureError(code: string) {
  vi.stubEnv("NEXT_PUBLIC_PAYPAL_CLIENT_ID", "test-client");
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify({ code, message: CHECKOUT_MESSAGES[code as keyof typeof CHECKOUT_MESSAGES] }), { status: 409 })));
  render(<BuyBox paintingId="p1" options={options} />);
  await act(() => buttonProps.at(-1)!.onApprove({ orderID: "PP-1" }));
}

describe("BuyBox", () => {
  it("does not load PayPal without a client id and points buyers to Contact", () => {
    vi.stubEnv("NEXT_PUBLIC_PAYPAL_CLIENT_ID", "");
    render(<BuyBox paintingId="p1" options={options} />);
    expect(screen.queryByTestId("paypal")).toBeNull();
    expect(screen.getByText("Online checkout isn't available right now. Please use the Contact page.")).toBeTruthy();
  });

  it("loads PayPal when a client id is set", () => {
    vi.stubEnv("NEXT_PUBLIC_PAYPAL_CLIENT_ID", "test-client");
    render(<BuyBox paintingId="p1" options={options} />);
    expect(screen.getByTestId("paypal")).toBeTruthy();
    expect(screen.queryByText(/Online checkout isn't available/)).toBeNull();
  });

  it("shows total_changed and stays on the page with the buttons", async () => {
    await approveWithCaptureError("total_changed");
    expect(screen.getByRole("alert").textContent).toBe(CHECKOUT_MESSAGES.total_changed);
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByTestId("paypal")).toBeTruthy();
  });

  it("shows unconfirmed and removes the payment buttons so the buyer can't pay twice", async () => {
    await approveWithCaptureError("unconfirmed");
    expect(screen.getByRole("alert").textContent).toBe(CHECKOUT_MESSAGES.unconfirmed);
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByTestId("paypal")).toBeNull();
  });
});
