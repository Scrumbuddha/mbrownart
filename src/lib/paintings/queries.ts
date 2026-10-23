import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { paintings, type Painting } from "../db/schema";

const order = [asc(paintings.sortOrder), desc(paintings.createdAt)] as const;

export function listGallery(db: Db): Promise<Painting[]> {
  return db.select().from(paintings).where(eq(paintings.visible, true)).orderBy(...order);
}

export function listPrints(db: Db): Promise<Painting[]> {
  return db.select().from(paintings)
    .where(and(eq(paintings.visible, true), eq(paintings.printEnabled, true)))
    .orderBy(...order);
}

export async function getPaintingBySlug(db: Db, slug: string): Promise<Painting | null> {
  const [row] = await db.select().from(paintings)
    .where(and(eq(paintings.slug, slug), eq(paintings.visible, true)));
  return row ?? null;
}

// A hold does not make the painting look unavailable, so `_now` is unused by design.
export function isOriginalPurchasable(p: Painting, _now: Date): boolean {
  return p.originalStatus === "for_sale" && p.originalPriceCents != null;
}
