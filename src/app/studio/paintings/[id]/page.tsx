import { notFound } from "next/navigation";
import { requireStudio } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getPaintingById } from "@/lib/paintings/admin";
import { PaintingForm } from "../../_components/PaintingForm";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditPaintingPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStudio();
  const { id } = await params;
  const p = UUID.test(id) ? await getPaintingById(getDb(), id) : null;
  if (!p) notFound();
  return (
    <main>
      <h1 style={{ fontSize: 22, fontWeight: 300, margin: "0 0 20px" }}>Edit painting</h1>
      <PaintingForm
        painting={{
          id: p.id, title: p.title, medium: p.medium, size: p.size, year: p.year,
          description: p.description, imageUrl: p.imageUrl, originalStatus: p.originalStatus,
          originalPriceCents: p.originalPriceCents, printEnabled: p.printEnabled,
          printSize: p.printSize, printPriceCents: p.printPriceCents, visible: p.visible,
        }}
      />
    </main>
  );
}
