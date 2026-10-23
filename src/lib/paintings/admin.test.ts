import { describe, expect, it } from "vitest";
import { createTestDb } from "../db/test-db";
import { listGallery } from "./queries";
import {
  createPainting, getPaintingById, listAllPaintings, movePainting, setOrder,
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
  it("updatePainting keeps slug, image and checkout hold; replaces image when given", async () => {
    const db = await createTestDb();
    const p = await createPainting(db, input(), img);
    const { paintings } = await import("../db/schema");
    const until = new Date(Date.now() + 60000);
    await db.update(paintings).set({ heldUntil: until }).execute();
    const u = await updatePainting(db, p.id, input({ title: "Renamed", visible: false }));
    expect(u).toMatchObject({ slug: "harbor-light", title: "Renamed", visible: false, imageUrl: "w" });
    expect(u?.heldUntil?.getTime()).toBe(until.getTime());
    const u2 = await updatePainting(db, p.id, input(), { ...img, imageUrl: "new" });
    expect(u2?.imageUrl).toBe("new");
  });
});
