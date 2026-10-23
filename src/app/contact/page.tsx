import type { Metadata } from "next";
import { getDb } from "@/lib/db/client";
import { getSettings } from "@/lib/db/settings";

export const revalidate = 0;

export const metadata: Metadata = { title: "Contact · M Brown Watercolors" };

export default async function ContactPage() {
  const { contactEmail, instagramUrl } = await getSettings(getDb());
  return (
    <main className="site-main">
      <div className="prose">
        <h1 className="page-title">Contact</h1>
        {contactEmail ? (
          <p>Email: <a href={`mailto:${contactEmail}`}>{contactEmail}</a></p>
        ) : null}
        {instagramUrl ? (
          <p>Instagram: <a href={instagramUrl} rel="noopener noreferrer" target="_blank">{instagramUrl.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a></p>
        ) : null}
      </div>
    </main>
  );
}
