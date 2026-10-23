"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { requireStudio } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { paintings } from "@/lib/db/schema";
import { getSettings } from "@/lib/db/settings";
import { sendShippedEmail } from "@/lib/email/shipped";
import { markShipped } from "@/lib/orders/admin";

export type ShipState = { message?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function markShippedAction(_prev: ShipState, formData: FormData): Promise<ShipState> {
  await requireStudio();
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return { message: "That order no longer exists." };
  const db = getDb();
  let emailFailed = false;
  try {
    await markShipped(db, id, new Date(), async (order) => {
      try {
        const [painting] = await db.select().from(paintings).where(eq(paintings.id, order.paintingId));
        await sendShippedEmail(order, painting, await getSettings(db));
      } catch (e) {
        // Log the reason only; never the buyer's address or the API key.
        console.error("Shipped email failed", e instanceof Error ? e.message : "unknown error");
        emailFailed = true;
      }
    });
  } catch (e) {
    console.error("Marking shipped failed", e instanceof Error ? e.message : "unknown error");
    return { message: "That didn't save. Please try again." };
  }
  revalidatePath("/studio/orders");
  return emailFailed ? { message: "Marked shipped, but the email to the buyer didn't send." } : {};
}
