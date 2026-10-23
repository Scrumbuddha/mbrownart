import type { Order } from "../db/schema";

const FL_TZ = "America/New_York";
const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: FL_TZ, year: "numeric", month: "2-digit", day: "2-digit",
});

/** The Florida calendar date (YYYY-MM-DD) of an instant, not the UTC date. */
export function floridaDate(d: Date): string {
  return dateFmt.format(d);
}

function dollars(cents: number): string {
  return `${Math.trunc(cents / 100)}.${String(Math.abs(cents % 100)).padStart(2, "0")}`;
}

function cell(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Paid orders in `month` ('YYYY-MM', Florida time) that collected tax, as CSV. */
export function taxCsv(orders: Order[], month: string): string {
  const rows = orders
    .filter((o) => o.status === "paid" && o.paidAt && o.taxCents > 0 && floridaDate(o.paidAt).startsWith(`${month}-`))
    .sort((a, b) => a.paidAt!.getTime() - b.paidAt!.getTime())
    .map((o) => [
      floridaDate(o.paidAt!),
      cell(o.taxCounty ?? ""),
      dollars(o.itemCents + o.shippingCents),
      dollars(o.taxCents),
    ].join(","));
  return ["date,county,taxable_amount,tax_collected", ...rows].join("\n") + "\n";
}
