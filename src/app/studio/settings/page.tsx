import { requireStudio } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getSettings } from "@/lib/db/settings";
import { SettingsForm } from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireStudio();
  const settings = await getSettings(getDb());
  return (
    <main>
      <h1 style={{ fontSize: 22, fontWeight: 300, margin: "0 0 20px" }}>Settings</h1>
      <SettingsForm settings={settings} />
    </main>
  );
}
