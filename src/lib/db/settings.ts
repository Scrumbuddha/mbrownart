import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { settings, type Settings } from "./schema";

export async function getSettings(db: Db): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (!row) throw new Error("settings row missing");
  return row;
}
