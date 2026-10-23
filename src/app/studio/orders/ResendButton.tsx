"use client";

import { useActionState } from "react";
import { resendShippedEmailAction, type ShipState } from "./actions";

export function ResendButton({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState<ShipState, FormData>(resendShippedEmailAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={orderId} />
      <p role="alert" style={{ color: "#b04a3a", fontSize: 15, margin: "0 0 8px" }}>
        {state.message ?? "The email to the buyer didn't send."}
      </p>
      <button type="submit" disabled={pending}
        style={{ padding: "10px 16px", fontSize: 16, fontWeight: 500, background: "#fff", color: "#222", border: "1px solid #999", borderRadius: 4, cursor: "pointer" }}>
        {pending ? "Sending..." : "Send email again"}
      </button>
    </form>
  );
}
