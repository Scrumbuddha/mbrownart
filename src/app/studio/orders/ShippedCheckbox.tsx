"use client";

import { useActionState } from "react";
import { markShippedAction, type ShipState } from "./actions";

export function ShippedCheckbox({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState<ShipState, FormData>(markShippedAction, {});
  return (
    <form action={action}>
      <input type="hidden" name="id" value={orderId} />
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, padding: "6px 0" }}>
        <input
          type="checkbox" disabled={pending} style={{ width: 24, height: 24 }}
          onChange={(e) => {
            const box = e.target;
            if (box.checked && window.confirm("Mark as shipped and email the buyer?")) box.form?.requestSubmit();
            else box.checked = false;
          }}
        />
        {pending ? "Saving..." : "Mark shipped (emails the buyer)"}
      </label>
      {state.message && <p role="alert" style={{ color: "#b04a3a", fontSize: 14, margin: "4px 0 0" }}>{state.message}</p>}
    </form>
  );
}
