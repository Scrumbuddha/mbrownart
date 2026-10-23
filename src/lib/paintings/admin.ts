import { asc, desc, eq, like, min, or } from "drizzle-orm";
import type { Db } from "../db/client";
import { paintings, type Painting } from "../db/schema";

export type PaintingInput = {
  title: string;
  medium: string;
  size: string;
  year: number | null;
  description: string;
  originalStatus: Painting["originalStatus"];
  originalPriceCents: number | null;
  printEnabled: boolean;
  printSize: string | null;
  printPriceCents: number | null;
  visible: boolean;
};

export type ProcessedImage = {
  imageUrl: string;
  imageLargeUrl: string;
  imageWidth: number;
  imageHeight: number;
};

type FormLike = { get(name: string): FormDataEntryValue | null };
export type ValidationResult =
  | { ok: true; value: PaintingInput }
  | { ok: false; errors: Record<string, string> };

const STATUSES = ["for_sale", "sold", "not_for_sale"] as const;

const text = (raw: FormLike, name: string) => String(raw.get(name) ?? "").trim();

/** "420" or "45.50" -> cents. null when blank, undefined when malformed. */
function dollarsToCents(s: string): number | null | undefined {
  const t = s.replace(/[$,\s]/g, "");
  if (t === "") return null;
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return undefined;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
}

export function validatePaintingInput(raw: FormLike): ValidationResult {
  const errors: Record<string, string> = {};

  const title = text(raw, "title");
  if (!title) errors.title = "Please give the painting a title.";

  const statusRaw = text(raw, "originalStatus");
  const originalStatus = (STATUSES as readonly string[]).includes(statusRaw)
    ? (statusRaw as PaintingInput["originalStatus"])
    : "for_sale";

  const yearRaw = text(raw, "year");
  let year: number | null = null;
  if (yearRaw) {
    if (/^\d{4}$/.test(yearRaw)) year = Number(yearRaw);
    else errors.year = "Enter the year as four digits, like 2024.";
  }

  const originalParsed = dollarsToCents(text(raw, "originalPrice"));
  let originalPriceCents: number | null = null;
  if (originalParsed === undefined) {
    errors.originalPriceCents = "Enter the price as dollars, like 420 or 45.50.";
  } else {
    originalPriceCents = originalParsed;
    if (originalStatus === "for_sale" && !(originalPriceCents && originalPriceCents > 0)) {
      errors.originalPriceCents = "Enter a price above $0 for a painting that is for sale.";
    }
  }

  const printEnabled = ["on", "true"].includes(text(raw, "printEnabled"));
  let printSize: string | null = null;
  let printPriceCents: number | null = null;
  if (printEnabled) {
    printSize = text(raw, "printSize") || null;
    if (!printSize) errors.printSize = "Enter the print size, like 8x10.";
    const parsed = dollarsToCents(text(raw, "printPrice"));
    if (parsed === undefined) {
      errors.printPriceCents = "Enter the price as dollars, like 45 or 45.50.";
    } else if (!(parsed && parsed > 0)) {
      errors.printPriceCents = "Enter a print price above $0.";
    } else {
      printPriceCents = parsed;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      medium: text(raw, "medium"),
      size: text(raw, "size"),
      year,
      description: text(raw, "description"),
      originalStatus,
      originalPriceCents,
      printEnabled,
      printSize,
      printPriceCents,
      visible: text(raw, "visible") !== "false",
    },
  };
}

const slugify = (title: string) =>
  title.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "painting";

async function uniqueSlug(db: Db, title: string): Promise<string> {
  const base = slugify(title);
  const rows = await db.select({ slug: paintings.slug }).from(paintings)
    .where(or(eq(paintings.slug, base), like(paintings.slug, `${base}-%`)));
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

const fields = (input: PaintingInput) => ({
  title: input.title,
  medium: input.medium,
  size: input.size,
  year: input.year ?? new Date().getFullYear(),
  description: input.description,
  originalStatus: input.originalStatus,
  originalPriceCents: input.originalPriceCents,
  printEnabled: input.printEnabled,
  printSize: input.printEnabled ? input.printSize : null,
  printPriceCents: input.printEnabled ? input.printPriceCents : null,
  visible: input.visible,
});

/** Every painting including hidden ones, in gallery order. */
export function listAllPaintings(db: Db): Promise<Painting[]> {
  return db.select().from(paintings).orderBy(asc(paintings.sortOrder), desc(paintings.createdAt));
}

export async function getPaintingById(db: Db, id: string): Promise<Painting | null> {
  const [row] = await db.select().from(paintings).where(eq(paintings.id, id));
  return row ?? null;
}

export async function createPainting(
  db: Db, input: PaintingInput, image: ProcessedImage,
): Promise<Painting> {
  const slug = await uniqueSlug(db, input.title);
  const [{ lowest }] = await db.select({ lowest: min(paintings.sortOrder) }).from(paintings);
  const [row] = await db.insert(paintings).values({
    ...fields(input), ...image, slug, sortOrder: (lowest ?? 0) - 1,
  }).returning();
  return row;
}

/** Keeps the slug, sort order and any checkout hold. Returns null if the painting is gone. */
export async function updatePainting(
  db: Db, id: string, input: PaintingInput, image?: ProcessedImage,
): Promise<Painting | null> {
  const [row] = await db.update(paintings)
    .set({ ...fields(input), ...(image ?? {}), updatedAt: new Date() })
    .where(eq(paintings.id, id)).returning();
  return row ?? null;
}

/** Writes sort order = position in `ids`. Paintings not listed are left alone. */
export async function setOrder(db: Db, ids: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx.update(paintings).set({ sortOrder: i }).where(eq(paintings.id, ids[i]));
    }
  });
}

export async function movePainting(db: Db, id: string, direction: "up" | "down"): Promise<void> {
  const ids = (await listAllPaintings(db)).map((p) => p.id);
  const i = ids.indexOf(id);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await setOrder(db, ids);
}
