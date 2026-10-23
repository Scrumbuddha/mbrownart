import { describe, expect, it } from "vitest";
import { createTestDb } from "./test-db";
import { getSettings } from "./settings";
import { paintings } from "./schema";

describe("schema", () => {
  it("seeds default settings", async () => {
    const db = await createTestDb();
    const s = await getSettings(db);
    expect(s).toMatchObject({ shippingCents: 1000, taxEnabled: true, artistName: "M Brown" });
  });

  it("applies painting defaults", async () => {
    const db = await createTestDb();
    const [p] = await db
      .insert(paintings)
      .values({
        slug: "x", title: "X", medium: "Watercolor", size: "8x10", year: 2024,
        description: "", imageUrl: "u", imageLargeUrl: "l", imageWidth: 800, imageHeight: 600,
      })
      .returning();
    expect(p.originalStatus).toBe("for_sale");
    expect(p.visible).toBe(true);
  });

  it("supports transactions", async () => {
    const db = await createTestDb();
    const s = await db.transaction(async (tx) => getSettings(tx as never));
    expect(s.id).toBe(1);
  });
});
