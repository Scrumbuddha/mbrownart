import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { settings, type Settings } from "./schema";

export async function getSettings(db: Db): Promise<Settings> {
  const [row] = await db.select().from(settings).where(eq(settings.id, 1));
  if (!row) throw new Error("settings row missing");
  return row;
}

export async function updateSettings(db: Db, patch: Partial<Settings>): Promise<void> {
  const { id: _id, ...fields } = patch;
  if (Object.keys(fields).length === 0) return;
  await db.update(settings).set(fields).where(eq(settings.id, 1));
}
