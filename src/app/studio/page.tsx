import Link from "next/link";
import { requireStudio } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listAllPaintings } from "@/lib/paintings/admin";
import { PaintingList, type StudioPainting } from "./_components/PaintingList";

export const dynamic = "force-dynamic";

export default async function StudioHome() {
  await requireStudio();
  const now = Date.now();
  const rows = await listAllPaintings(getDb());
  const items: StudioPainting[] = rows.map((p) => ({
    id: p.id,
    title: p.title,
    imageUrl: p.imageUrl,
    originalStatus: p.originalStatus,
    visible: p.visible,
    inCheckout: !!p.heldUntil && p.heldUntil.getTime() > now,
  }));
  return (
    <main>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 300, margin: 0 }}>Paintings</h1>
        <Link
          href="/studio/paintings/new"
          style={{ background: "#222", color: "#fff", padding: "10px 16px", borderRadius: 4, textDecoration: "none", fontSize: 15, fontWeight: 500 }}
        >
          Add a painting
        </Link>
      </div>
      {items.length === 0 ? (
        <p style={{ color: "#777" }}>No paintings yet. Tap &ldquo;Add a painting&rdquo; to start.</p>
      ) : (
        <PaintingList items={items} />
      )}
    </main>
  );
}
