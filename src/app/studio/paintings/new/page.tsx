import { requireStudio } from "@/lib/auth/session";
import { PaintingForm } from "../../_components/PaintingForm";

export const dynamic = "force-dynamic";

export default async function NewPaintingPage() {
  await requireStudio();
  return (
    <main>
      <h1 style={{ fontSize: 22, fontWeight: 300, margin: "0 0 20px" }}>Add a painting</h1>
      <PaintingForm />
    </main>
  );
}
