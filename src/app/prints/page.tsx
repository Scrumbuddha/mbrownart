import type { Metadata } from "next";
import { getDb } from "@/lib/db/client";
import { listPrints } from "@/lib/paintings/queries";
import { GalleryGrid } from "../_components/GalleryGrid";

export const revalidate = 0;

export const metadata: Metadata = { title: "Prints · M Brown Watercolors" };

export default async function PrintsPage() {
  const paintings = await listPrints(getDb());
  return (
    <main className="site-main">
      <h1 className="page-title">Prints</h1>
      {paintings.length > 0
        ? <GalleryGrid paintings={paintings} />
        : <p className="empty">No prints right now. Check back soon.</p>}
    </main>
  );
}
