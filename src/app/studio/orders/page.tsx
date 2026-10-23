import { requireStudio } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { formatCents } from "@/lib/money";
import { listPaidOrders, type PaidOrder } from "@/lib/orders/admin";
import { ATTENTION_MESSAGES, TEST_ORDER_LABEL, shipControl } from "@/lib/orders/attention";
import { floridaDate } from "@/lib/orders/tax-csv";
import { ResendButton } from "./ResendButton";
import { ShippedCheckbox } from "./ShippedCheckbox";

export const dynamic = "force-dynamic";

const card = { border: "1px solid #ddd", borderRadius: 6, padding: 16, marginBottom: 16 } as const;

const note = { margin: "0 0 8px", color: "#777", fontSize: 15 } as const;

function ShipArea({ o }: { o: PaidOrder }) {
  switch (shipControl(o)) {
    case "none":
      return null;
    case "mark_shipped":
      return <ShippedCheckbox orderId={o.id} emailsBuyer={!!o.buyerEmail} />;
    case "shipped":
      return <p style={note}>Shipped {floridaDate(o.shippedAt!)}</p>;
    case "resend_email":
      return <><p style={note}>Shipped {floridaDate(o.shippedAt!)}</p><ResendButton orderId={o.id} /></>;
    case "no_buyer_email":
      return <><p style={note}>Shipped {floridaDate(o.shippedAt!)}</p><p style={note}>No buyer email on this order</p></>;
  }
}

function OrderCard({ o }: { o: PaidOrder }) {
  const s = o.shipTo;
  return (
    <section style={{ ...card, ...(o.attention ? { border: "2px solid #b04a3a" } : {}) }}>
      {o.paypalEnv === "sandbox" && (
        <p style={{ display: "inline-block", background: "#eee", color: "#333", fontSize: 14, fontWeight: 500, padding: "4px 8px", borderRadius: 4, margin: "0 0 12px" }}>
          {TEST_ORDER_LABEL}
        </p>
      )}
      {o.attention && (
        <p role="alert" style={{ background: "#fbeeea", color: "#b04a3a", fontWeight: 500, padding: 12, borderRadius: 4, margin: "0 0 12px" }}>
          {ATTENTION_MESSAGES[o.attention]}
        </p>
      )}
      <p style={{ margin: "0 0 4px", color: "#777", fontSize: 14 }}>{o.paidAt ? floridaDate(o.paidAt) : ""}</p>
      <h2 style={{ fontSize: 18, fontWeight: 500, margin: "0 0 4px" }}>
        {o.paintingTitle} ({o.item === "original" ? "original" : "print"})
      </h2>
      <p style={{ margin: "0 0 12px", fontSize: 16 }}>
        {formatCents(o.itemCents)} + {formatCents(o.shippingCents)} shipping + {formatCents(o.taxCents)} tax ={" "}
        <strong>{formatCents(o.totalCents)}</strong>
      </p>
      <p style={{ margin: "0 0 12px", fontSize: 16, lineHeight: 1.5 }}>
        {o.buyerName ?? s?.name}
        {s && (
          <>
            <br />{s.line1}
            {s.line2 && <><br />{s.line2}</>}
            <br />{s.city}, {s.state} {s.zip}
          </>
        )}
        {o.buyerEmail && <><br /><span style={{ color: "#777" }}>{o.buyerEmail}</span></>}
      </p>
      <ShipArea o={o} />
    </section>
  );
}

export default async function OrdersPage() {
  await requireStudio();
  const all = await listPaidOrders(getDb());
  const flagged = all.filter((o) => o.attention);
  const rest = all.filter((o) => !o.attention);
  const thisMonth = floridaDate(new Date()).slice(0, 7);
  return (
    <main>
      <h1 style={{ fontSize: 22, fontWeight: 300, margin: "0 0 16px" }}>Orders</h1>
      <form
        method="get" action="/api/studio/tax-export"
        style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", margin: "0 0 24px" }}
      >
        <div>
          <label htmlFor="month" style={{ display: "block", fontSize: 14, margin: "0 0 6px" }}>Month</label>
          <input id="month" name="month" type="month" required defaultValue={thisMonth}
            style={{ padding: "10px 12px", fontSize: 16, border: "1px solid #ccc", borderRadius: 4 }} />
        </div>
        <button type="submit"
          style={{ padding: "12px 16px", fontSize: 16, fontWeight: 500, background: "#222", color: "#fff", border: 0, borderRadius: 4, cursor: "pointer" }}>
          Download tax report
        </button>
      </form>
      {all.length === 0 && <p style={{ color: "#777" }}>No orders yet.</p>}
      {flagged.length > 0 && (
        <>
          <h2 style={{ fontSize: 17, fontWeight: 500, color: "#b04a3a", margin: "0 0 12px" }}>Needs your attention</h2>
          {flagged.map((o) => <OrderCard key={o.id} o={o} />)}
        </>
      )}
      {rest.map((o) => <OrderCard key={o.id} o={o} />)}
    </main>
  );
}
