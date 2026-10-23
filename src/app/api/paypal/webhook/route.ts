import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getPayPal } from "@/lib/paypal/server";
import { handleWebhookEvent } from "@/lib/checkout/webhook";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text();
  let event: { event_type: string; resource: unknown; id?: string };
  try {
    const pp = getPayPal();
    if (!(await pp.verifyWebhook(req.headers, raw))) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    event = JSON.parse(raw);
    await handleWebhookEvent(getDb(), pp, event, new Date());
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Return 500 so PayPal retries. Log only the error type, never the payload.
    console.error("paypal webhook failed:", e instanceof Error ? e.name : "unknown");
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
