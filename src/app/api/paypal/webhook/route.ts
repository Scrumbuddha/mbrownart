import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getPayPal } from "@/lib/paypal/server";
import { handleWebhookRequest } from "@/lib/checkout/webhook";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const raw = await req.text();
  let r: { status: number; body: unknown };
  try {
    r = await handleWebhookRequest(getDb(), getPayPal(), req.headers, raw, new Date());
  } catch (e) {
    console.error("paypal webhook setup failed:", e instanceof Error ? e.name : "unknown");
    r = { status: 500, body: { ok: false } };
  }
  return NextResponse.json(r.body, { status: r.status });
}
