import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getPayPal } from "@/lib/paypal/server";
import { handleCapture, errorResult, readJson } from "@/lib/checkout/handlers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const r = await handleCapture(getDb(), getPayPal(), await readJson(req), new Date());
    return NextResponse.json(r.body, { status: r.status });
  } catch (e) {
    const r = errorResult(e);
    return NextResponse.json(r.body, { status: r.status });
  }
}
