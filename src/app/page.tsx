import { getDb } from "@/lib/db/client";
import { listGallery } from "@/lib/paintings/queries";
import { GalleryGrid } from "./_components/GalleryGrid";

export const revalidate = 0;

export default async function Home() {
  const paintings = await listGallery(getDb());
  return (
    <main className="site-main">
      <h1 className="visually-hidden">Paintings</h1>
      {paintings.length > 0
        ? <GalleryGrid paintings={paintings} />
        : <p className="empty">New paintings are on the way.</p>}
    </main>
  );
}
