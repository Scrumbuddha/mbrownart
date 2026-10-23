"use client";

import { useActionState } from "react";
import { markShippedAction, type ShipState } from "./actions";

export function ShippedCheckbox({ orderId, emailsBuyer }: { orderId: string; emailsBuyer: boolean }) {
  const [state, action, pending] = useActionState<ShipState, FormData>(markShippedAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={orderId} />
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, padding: "6px 0" }}>
        <input
          type="checkbox" disabled={pending} style={{ width: 24, height: 24 }}
          onChange={(e) => {
            const box = e.target;
            if (box.checked && window.confirm(emailsBuyer ? "Mark as shipped and email the buyer?" : "Mark as shipped?")) box.form?.requestSubmit();
            else box.checked = false;
          }}
        />
        {pending ? "Saving..." : emailsBuyer ? "Mark shipped (emails the buyer)" : "Mark shipped (no buyer email on this order)"}
      </label>
      {state.message && <p role="alert" style={{ color: "#b04a3a", fontSize: 14, margin: "4px 0 0" }}>{state.message}</p>}
    </form>
  );
}
