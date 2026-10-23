import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getPayPal } from "@/lib/paypal/server";
import { handleCapture, errorResult, readJson } from "@/lib/checkout/handlers";

export const runtime = "nodejs";
// PayPal capture plus the follow-up order lookup can take a while; don't cut it off mid-payment.
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const r = await handleCapture(getDb(), getPayPal(), await readJson(req), new Date());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    const r = errorResult(e);
    return NextResponse.json(r.body, { status: r.status });
  }
}
