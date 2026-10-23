// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@paypal/react-paypal-js", () => ({
  PayPalScriptProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="paypal">{children}</div>,
  PayPalButtons: () => null,
}));

import { BuyBox } from "./BuyBox";

const options = [{ item: "original" as const, label: "Original (one of a kind)", price: "$420", disabled: false }];

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

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
});
