import { describe, expect, it } from "vitest";
import { createTestDb } from "../db/test-db";
import { paintings } from "../db/schema";
import type { Db } from "../db/client";
import { getPaintingBySlug, isOriginalPurchasable, listGallery, listPrints } from "./queries";

const base = {
  title: "X", medium: "Watercolor", size: "8x10", year: 2024,
  description: "", imageUrl: "u", imageLargeUrl: "l", imageWidth: 800, imageHeight: 600,
};

async function seed(): Promise<Db> {
  const db = await createTestDb();
  await db.insert(paintings).values([
    { ...base, slug: "b", sortOrder: 2, printEnabled: true, printPriceCents: 4500 },
    { ...base, slug: "a", sortOrder: 1 },
    { ...base, slug: "hidden", sortOrder: 0, visible: false, printEnabled: true, printPriceCents: 4500 },
    { ...base, slug: "c-old", sortOrder: 3, printEnabled: true, printPriceCents: 4500, createdAt: new Date("2024-01-01") },
    { ...base, slug: "c-new", sortOrder: 3, printEnabled: true, printPriceCents: 4500, createdAt: new Date("2025-01-01") },
  ]);
  return db;
}

describe("queries", () => {
  it("listGallery excludes hidden and orders by sortOrder then newest", async () => {
    const db = await seed();
    expect((await listGallery(db)).map((p) => p.slug)).toEqual(["a", "b", "c-new", "c-old"]);
  });
  it("listPrints excludes hidden and non-print paintings", async () => {
    const db = await seed();
    expect((await listPrints(db)).map((p) => p.slug)).toEqual(["b", "c-new", "c-old"]);
  });
  it("getPaintingBySlug returns visible paintings and null for hidden or missing", async () => {
    const db = await seed();
    expect((await getPaintingBySlug(db, "a"))?.slug).toBe("a");
    expect(await getPaintingBySlug(db, "hidden")).toBeNull();
    expect(await getPaintingBySlug(db, "nope")).toBeNull();
  });
});

describe("isOriginalPurchasable", () => {
  const now = new Date("2026-01-01");
  const p = { ...base, slug: "s", originalStatus: "for_sale", originalPriceCents: 42000 } as Parameters<typeof isOriginalPurchasable>[0];
  it("is true when for sale with a price", () => {
    expect(isOriginalPurchasable(p, now)).toBe(true);
  });
  it("is still true while held", () => {
    expect(isOriginalPurchasable({ ...p, heldUntil: new Date("2026-06-01") }, now)).toBe(true);
  });
  it("is false when sold, not for sale, or unpriced", () => {
    expect(isOriginalPurchasable({ ...p, originalStatus: "sold" }, now)).toBe(false);
    expect(isOriginalPurchasable({ ...p, originalStatus: "not_for_sale" }, now)).toBe(false);
    expect(isOriginalPurchasable({ ...p, originalPriceCents: null }, now)).toBe(false);
  });
});
