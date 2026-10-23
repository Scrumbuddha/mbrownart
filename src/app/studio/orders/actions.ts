"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireStudio } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { paintings, type Order } from "@/lib/db/schema";
import { getSettings } from "@/lib/db/settings";
import { sendShippedEmail } from "@/lib/email/shipped";
import { markShipped, resendShippedEmail } from "@/lib/orders/admin";

export type ShipState = { message?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class NoBuyerEmail extends Error {}

async function sendFor(order: Order): Promise<void> {
  if (!order.buyerEmail) throw new NoBuyerEmail("no buyer email");
  const db = getDb();
  const [painting] = await db.select().from(paintings).where(eq(paintings.id, order.paintingId));
  await sendShippedEmail(order, painting, await getSettings(db));
}

/** Runs `run` with a send function that notes email failures. Logs the reason only, never the address or API key. */
async function withEmailOutcome(run: (send: (o: Order) => Promise<void>) => Promise<void>): Promise<ShipState> {
  let emailFailed = false;
  let noEmail = false;
  try {
    await run(async (order) => {
      try {
        await sendFor(order);
      } catch (e) {
        if (e instanceof NoBuyerEmail) noEmail = true;
        else console.error("Shipped email failed", e instanceof Error ? e.message : "unknown error");
        emailFailed = true;
        throw e;
      }
    });
  } catch (e) {
    if (!emailFailed) {
      console.error("Shipping update failed", e instanceof Error ? e.message : "unknown error");
      return { message: "That didn't save. Please try again." };
    }
  }
  revalidatePath("/studio/orders");
  // The order card also shows this, from the saved state, once the page refreshes.
  if (noEmail) return { message: "Marked shipped. There's no buyer email on this order, so no email was sent." };
  return emailFailed ? { message: "Marked shipped, but the email to the buyer didn't send." } : {};
}

export async function markShippedAction(_prev: ShipState, formData: FormData): Promise<ShipState> {
  await requireStudio();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { message: "That order no longer exists." };
  return withEmailOutcome((send) => markShipped(getDb(), id, new Date(), send));
}

export async function resendShippedEmailAction(_prev: ShipState, formData: FormData): Promise<ShipState> {
  await requireStudio();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { message: "That order no longer exists." };
  const state = await withEmailOutcome((send) => resendShippedEmail(getDb(), id, new Date(), send));
  return state.message ? { message: "The email still didn't send. Please try again in a little while." } : state;
}
