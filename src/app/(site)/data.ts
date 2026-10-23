import { cache } from "react";
import { getDb } from "@/lib/db/client";
import { getSettings } from "@/lib/db/settings";
import { getPaintingBySlug } from "@/lib/paintings/queries";

/** Request-scoped reads, so the layout, metadata and page share one query each. */
export const siteSettings = cache(() => getSettings(getDb()));

export const paintingBySlug = cache((slug: string) => getPaintingBySlug(getDb(), slug));

export const FALLBACK_ARTIST_NAME = "M Brown";

/** The artist name for the header and titles; a failed read must not take the page down. */
export const artistName = cache(async (): Promise<string> => {
  try {
    return (await siteSettings()).artistName;
  } catch (e) {
    console.error("site settings read failed:", e instanceof Error ? e.name : "unknown");
    return FALLBACK_ARTIST_NAME;
  }
});
