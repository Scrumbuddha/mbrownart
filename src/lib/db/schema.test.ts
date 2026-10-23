import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "./test-db";
import { getSettings } from "./settings";
import { paintings } from "./schema";

const base = {
  title: "X", medium: "Watercolor", size: "8x10", year: 2024,
  description: "", imageUrl: "u", imageLargeUrl: "l", imageWidth: 800, imageHeight: 600,
};

describe("schema", () => {
  it("seeds default settings", async () => {
    const db = await createTestDb();
    const s = await getSettings(db);
    expect(s).toMatchObject({ shippingCents: 1000, taxEnabled: true, artistName: "M Brown" });
  });

  it("applies painting defaults", async () => {
    const db = await createTestDb();
    const [p] = await db.insert(paintings).values({ slug: "x", ...base }).returning();
    expect(p.originalStatus).toBe("for_sale");
    expect(p.visible).toBe(true);
  });

  it("commits a transaction and a tx is usable as Db", async () => {
    const db = await createTestDb();
    await db.transaction(async (tx) => {
      await getSettings(tx);
      await tx.insert(paintings).values({ slug: "commit", ...base });
    });
    const rows = await db.select().from(paintings).where(eq(paintings.slug, "commit"));
    expect(rows).toHaveLength(1);
  });

  it("rolls back a failed transaction", async () => {
    const db = await createTestDb();
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(paintings).values({ slug: "rollback", ...base });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const rows = await db.select().from(paintings).where(eq(paintings.slug, "rollback"));
    expect(rows).toHaveLength(0);
  });
});
