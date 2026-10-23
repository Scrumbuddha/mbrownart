import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { orders, paintings } from "@/lib/db/schema";
import { formatCents } from "@/lib/money";

export const revalidate = 0;

// Reachable by anyone holding the URL, so it shows no buyer details.
export const metadata: Metadata = { title: "Thank you · M Brown Watercolors", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findPaidOrder(id: string) {
  const [row] = await getDb()
    .select({
      item: orders.item,
      itemCents: orders.itemCents,
      shippingCents: orders.shippingCents,
      taxCents: orders.taxCents,
      totalCents: orders.totalCents,
      title: paintings.title,
      printSize: paintings.printSize,
    })
    .from(orders)
    .innerJoin(paintings, eq(orders.paintingId, paintings.id))
    .where(and(eq(orders.id, id), eq(orders.status, "paid")));
  return row ?? null;
}

type Props = { searchParams: Promise<{ order?: string | string[] }> };

export default async function ThankYouPage({ searchParams }: Props) {
  const id = (await searchParams).order;
  const order = typeof id === "string" && UUID.test(id) ? await findPaidOrder(id) : null;

  if (!order) {
    return (
      <main className="site-main">
        <div className="prose">
          <h1 className="page-title">Thanks for visiting</h1>
          <p><Link href="/">Back to the paintings</Link></p>
        </div>
      </main>
    );
  }

  const itemLabel = order.item === "original"
    ? "Original (one of a kind)"
    : order.printSize ? `Print, ${order.printSize}` : "Print";

  return (
    <main className="site-main">
      <div className="prose">
        <h1 className="page-title">{order.title}</h1>
        <p className="muted">{itemLabel}</p>
        <table className="totals">
          <tbody>
            <tr><th scope="row">Item</th><td>{formatCents(order.itemCents)}</td></tr>
            <tr><th scope="row">Shipping</th><td>{formatCents(order.shippingCents)}</td></tr>
            <tr><th scope="row">Sales tax</th><td>{formatCents(order.taxCents)}</td></tr>
            <tr className="total"><th scope="row">Total</th><td>{formatCents(order.totalCents)}</td></tr>
          </tbody>
        </table>
        <p>Thank you! I&apos;ll pack it up and ship it soon. You&apos;ll get an email when it&apos;s on its way.</p>
        <p><Link href="/">Back to the paintings</Link></p>
      </div>
    </main>
  );
}
