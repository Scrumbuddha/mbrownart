import { formatCents } from "../money";
import type { Painting } from "../db/schema";

type CaptionInput = Pick<Painting, "originalStatus" | "originalPriceCents" | "printEnabled" | "printPriceCents">;

export function galleryCaption(p: CaptionInput): { price: string | null; sold: boolean } {
  const hasPrint = p.printEnabled && p.printPriceCents != null;
  const print = hasPrint ? formatCents(p.printPriceCents as number) : null;

  if (p.originalStatus === "sold") {
    return { price: print ? `prints ${print}` : null, sold: true };
  }
  if (p.originalStatus === "for_sale" && p.originalPriceCents != null) {
    return { price: formatCents(p.originalPriceCents), sold: false };
  }
  return { price: print ? `Print ${print}` : null, sold: false };
}
