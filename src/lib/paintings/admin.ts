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

const MAX_PRICE_CENTS = 100_000_000; // $1,000,000, safely inside int4
const PRICE_FORMAT = "Enter the price as dollars, like 420 or 45.50.";

/** "420", "1,200" or "45.50" -> cents. cents is null when blank. */
export function parsePrice(s: string): { cents: number | null } | { error: string } {
  const t = s.replace(/[$\s]/g, "");
  if (t === "") return { cents: null };
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return { error: PRICE_FORMAT };
  const cents = Number(m[1].replace(/,/g, "")) * 100 + Number((m[2] ?? "").padEnd(2, "0") || 0);
  if (cents >= MAX_PRICE_CENTS) return { error: "Please enter a price under $1,000,000." };
  return { cents };
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

  const originalParsed = parsePrice(text(raw, "originalPrice"));
  let originalPriceCents: number | null = null;
  if ("error" in originalParsed) {
    errors.originalPriceCents = originalParsed.error;
  } else {
    originalPriceCents = originalParsed.cents;
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
    const parsed = parsePrice(text(raw, "printPrice"));
    if ("error" in parsed) {
      errors.printPriceCents = parsed.error;
    } else if (!(parsed.cents && parsed.cents > 0)) {
      errors.printPriceCents = "Enter a print price above $0.";
    } else {
      printPriceCents = parsed.cents;
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

// A blank year keeps the stored one on edit (see updatePainting) and defaults to this year on create.
const fields = (input: PaintingInput) => ({
  title: input.title,
  medium: input.medium,
  size: input.size,
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
    ...fields(input), year: input.year ?? new Date().getFullYear(), ...image, slug, sortOrder: (lowest ?? 0) - 1,
  }).returning();
  return row;
}

/** Keeps the slug, sort order and any checkout hold. Returns null if the painting is gone. */
export async function updatePainting(
  db: Db, id: string, input: PaintingInput, image?: ProcessedImage,
): Promise<Painting | null> {
  const [row] = await db.update(paintings)
    .set({ ...fields(input), ...(input.year == null ? {} : { year: input.year }), ...(image ?? {}), updatedAt: new Date() })
    .where(eq(paintings.id, id)).returning();
  return row ?? null;
}

/**
 * Writes sort order 0..n-1 following `ids`. Unknown and repeated ids are dropped,
 * and paintings left out of the list keep their current relative order after it.
 */
export async function setOrder(db: Db, ids: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    const current = (await listAllPaintings(tx)).map((p) => p.id);
    const known = new Set(current);
    const seen = new Set<string>();
    const final: string[] = [];
    for (const id of [...ids, ...current]) {
      if (known.has(id) && !seen.has(id)) {
        seen.add(id);
        final.push(id);
      }
    }
    for (let i = 0; i < final.length; i++) {
      await tx.update(paintings).set({ sortOrder: i }).where(eq(paintings.id, final[i]));
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
