import { describe, expect, it } from "vitest";
import { paintings } from "../db/schema";
import { createTestDb } from "../db/test-db";
import { listGallery } from "./queries";
import {
  JUST_SOLD, createPainting, getPaintingById, listAllPaintings, loadedStatusOf, movePainting, setOrder,
  updatePainting, validatePaintingInput, type PaintingInput, type ProcessedImage,
} from "./admin";

const img: ProcessedImage = { imageUrl: "w", imageLargeUrl: "l", imageWidth: 800, imageHeight: 600 };
const input = (over: Partial<PaintingInput> = {}): PaintingInput => ({
  title: "Harbor Light", medium: "Watercolor", size: "8x10", year: 2024, description: "",
  originalStatus: "for_sale", originalPriceCents: 42000, printEnabled: false,
  printSize: null, printPriceCents: null, visible: true, ...over,
});
const form = (o: Record<string, string>) => new Map(Object.entries(o)) as unknown as FormData;

describe("validatePaintingInput", () => {
  it("requires a title", () => {
    const r = validatePaintingInput(form({ title: "  ", originalStatus: "sold" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.title).toBeTruthy();
  });
  it("requires a price for an original that is for sale", () => {
    const r = validatePaintingInput(form({ title: "A", originalStatus: "for_sale", originalPrice: "" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.originalPriceCents).toBeTruthy();
  });
  it("converts dollars to cents", () => {
    const r = validatePaintingInput(form({
      title: "A", originalStatus: "for_sale", originalPrice: "420",
      printEnabled: "on", printSize: "5x7", printPrice: "45.50", year: "2023",
    }));
    expect(r).toMatchObject({ ok: true, value: { originalPriceCents: 42000, printPriceCents: 4550, printSize: "5x7", printEnabled: true, year: 2023 } });
  });
  it("requires a print size and price when prints are on", () => {
    const r = validatePaintingInput(form({ title: "A", originalStatus: "sold", printEnabled: "on", printSize: "", printPrice: "0" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.printSize).toBeTruthy();
      expect(r.errors.printPriceCents).toBeTruthy();
    }
  });
  it("rejects a malformed price", () => {
    const r = validatePaintingInput(form({ title: "A", originalStatus: "for_sale", originalPrice: "12.345" }));
    expect(r.ok).toBe(false);
  });
});

describe("price parsing", () => {
  const orig = (p: string) => validatePaintingInput(form({ title: "A", originalStatus: "for_sale", originalPrice: p }));
  it.each([["1,200", 120000], ["12,000", 1200000], ["$420", 42000], ["45.5", 4550]])("accepts %s", (p, cents) => {
    expect(orig(p)).toMatchObject({ ok: true, value: { originalPriceCents: cents } });
  });
  it.each(["abc", "-5", "0.005", "0", "1,2", "1,20", "99999999", "1000000"])("rejects %s", (p) => {
    const r = orig(p);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.originalPriceCents).toBeTruthy();
  });
  it("explains a too-large price", () => {
    const r = orig("99999999");
    if (!r.ok) expect(r.errors.originalPriceCents).toBe("Please enter a price under $1,000,000.");
  });
  it("caps the print price too", () => {
    const r = validatePaintingInput(form({ title: "A", originalStatus: "sold", printEnabled: "on", printSize: "5x7", printPrice: "99999999" }));
    expect(r.ok).toBe(false);
  });
});

describe("admin persistence", () => {
  it("makes unique slugs", async () => {
    const db = await createTestDb();
    const a = await createPainting(db, input(), img);
    const b = await createPainting(db, input(), img);
    const c = await createPainting(db, input(), img);
    expect([a.slug, b.slug, c.slug]).toEqual(["harbor-light", "harbor-light-2", "harbor-light-3"]);
  });
  it("puts a new painting first in the gallery", async () => {
    const db = await createTestDb();
    await createPainting(db, input({ title: "One" }), img);
    await createPainting(db, input({ title: "Two" }), img);
    expect((await listGallery(db)).map((p) => p.title)).toEqual(["Two", "One"]);
  });
  it("lists hidden paintings for the Studio and finds by id", async () => {
    const db = await createTestDb();
    const p = await createPainting(db, input({ visible: false }), img);
    expect((await listAllPaintings(db)).map((x) => x.id)).toEqual([p.id]);
    expect(await listGallery(db)).toEqual([]);
    expect((await getPaintingById(db, p.id))?.title).toBe("Harbor Light");
    expect(await getPaintingById(db, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });
  it("movePainting swaps neighbours and ignores the ends", async () => {
    const db = await createTestDb();
    await createPainting(db, input({ title: "A" }), img);
    await createPainting(db, input({ title: "B" }), img);
    await createPainting(db, input({ title: "C" }), img);
    const titles = async () => (await listAllPaintings(db)).map((p) => p.title);
    expect(await titles()).toEqual(["C", "B", "A"]);
    const [c, b] = await listAllPaintings(db);
    await movePainting(db, c.id, "down");
    expect(await titles()).toEqual(["B", "C", "A"]);
    await movePainting(db, b.id, "up");
    expect(await titles()).toEqual(["B", "C", "A"]);
  });
  it("setOrder reorders by the given id list", async () => {
    const db = await createTestDb();
    await createPainting(db, input({ title: "A" }), img);
    await createPainting(db, input({ title: "B" }), img);
    const [b, a] = await listAllPaintings(db);
    await setOrder(db, [a.id, b.id]);
    expect((await listAllPaintings(db)).map((p) => p.title)).toEqual(["A", "B"]);
  });
  it("setOrder tolerates partial lists, duplicates and unknown ids", async () => {
    const db = await createTestDb();
    for (const t of ["A", "B", "C", "D"]) await createPainting(db, input({ title: t }), img);
    const titles = async () => (await listAllPaintings(db)).map((p) => p.title);
    expect(await titles()).toEqual(["D", "C", "B", "A"]);
    const [d, c, b, a] = await listAllPaintings(db);
    await setOrder(db, [a.id, a.id, "00000000-0000-0000-0000-000000000000", b.id]);
    expect(await titles()).toEqual(["A", "B", "D", "C"]);
    expect((await listAllPaintings(db)).map((p) => p.sortOrder)).toEqual([0, 1, 2, 3]);
    await setOrder(db, []);
    expect(await titles()).toEqual(["A", "B", "D", "C"]);
    void c; void d;
  });
  it("updatePainting keeps the stored year when the year is blank", async () => {
    const db = await createTestDb();
    const p = await createPainting(db, input({ year: 2019 }), img);
    const u = await saved(updatePainting(db, p.id, input({ year: null }), { loadedStatus: "for_sale" }));
    expect(u.year).toBe(2019);
  });
  it("updatePainting keeps slug, image and checkout hold; replaces image when given", async () => {
    const db = await createTestDb();
    const p = await createPainting(db, input(), img);
    const until = new Date(Date.now() + 60000);
    await db.update(paintings).set({ heldUntil: until }).execute();
    const u = await saved(updatePainting(db, p.id, input({ title: "Renamed", visible: false }), { loadedStatus: "for_sale" }));
    expect(u).toMatchObject({ slug: "harbor-light", title: "Renamed", visible: false, imageUrl: "w" });
    expect(u.heldUntil?.getTime()).toBe(until.getTime());
    const u2 = await saved(updatePainting(db, p.id, input(), { loadedStatus: "for_sale", image: { ...img, imageUrl: "new" } }));
    expect(u2.imageUrl).toBe("new");
  });
  it("updatePainting reports a painting that no longer exists", async () => {
    const db = await createTestDb();
    const r = await updatePainting(db, "00000000-0000-4000-8000-000000000000", input(), { loadedStatus: "for_sale" });
    expect(r).toEqual({ ok: false, error: "not_found" });
  });
});

describe("updatePainting from a stale edit form", () => {
  for (const loadedStatus of ["for_sale", "not_for_sale", null] as const) {
    it(`refuses to save anything when the painting sold after the form loaded (${loadedStatus})`, async () => {
      const db = await createTestDb();
      const p = await createPainting(db, input(), img);
      await db.update(paintings).set({ originalStatus: "sold" }).execute(); // a buyer paid meanwhile
      const r = await updatePainting(db, p.id, input({ title: "Renamed", originalStatus: "for_sale" }), { loadedStatus });
      expect(r).toEqual({ ok: false, error: "just_sold" });
      expect(await getPaintingById(db, p.id)).toMatchObject({ originalStatus: "sold", title: "Harbor Light" });
    });
  }

  it("reads the form's loadedStatus, treating anything unknown as not sold", () => {
    expect(loadedStatusOf(form({ loadedStatus: "sold" }))).toBe("sold");
    expect(loadedStatusOf(form({ loadedStatus: "for_sale" }))).toBe("for_sale");
    expect(loadedStatusOf(form({ loadedStatus: "SOLD" }))).toBeNull();
    expect(loadedStatusOf(form({}))).toBeNull();
    expect(JUST_SOLD).toBe("This painting just sold. Reload the page to see the latest.");
  });

  it("saves normally when the form loaded the painting as sold", async () => {
    const db = await createTestDb();
    const p = await createPainting(db, input({ originalStatus: "sold" }), img);
    const u = await saved(updatePainting(db, p.id, input({ title: "Renamed", originalStatus: "not_for_sale" }), { loadedStatus: "sold" }));
    expect(u).toMatchObject({ title: "Renamed", originalStatus: "not_for_sale" });
  });
});

async function saved(r: ReturnType<typeof updatePainting>) {
  const out = await r;
  if (!out.ok) throw new Error(`expected a saved painting, got ${out.error}`);
  return out.painting;
}
