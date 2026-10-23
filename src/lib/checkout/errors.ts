export type CheckoutErrorCode =
  | "sold" | "held" | "unavailable" | "not_us" | "amount_mismatch" | "payment_failed" | "in_progress"
  | "total_changed";

const TRY_AGAIN = "Something went wrong and you were not charged. Please try again.";

/** Buyer-facing copy for each checkout error code. */
export const CHECKOUT_MESSAGES: Record<CheckoutErrorCode, string> = {
  held: "Someone is checking out with this painting right now. Try again in a few minutes.",
  sold: "Sorry, this one just sold.",
  not_us: "Sorry, we can only ship within the US.",
  unavailable: TRY_AGAIN,
  amount_mismatch: TRY_AGAIN,
  payment_failed: TRY_AGAIN,
  in_progress: "Your payment is being processed. Please wait a moment.",
  total_changed:
    "The total changed because sales tax was added for your shipping address. Please review and pay again.",
};

export class CheckoutError extends Error {
  code: CheckoutErrorCode;
  constructor(code: CheckoutErrorCode) {
    super(CHECKOUT_MESSAGES[code]);
    this.name = "CheckoutError";
    this.code = code;
  }
}
