import type { Metadata } from "next";
import { getDb } from "@/lib/db/client";
import { getSettings } from "@/lib/db/settings";

export const revalidate = 0;

export const metadata: Metadata = { title: "About · M Brown Watercolors" };

export default async function AboutPage() {
  const { artistName, aboutText, aboutPhotoUrl } = await getSettings(getDb());
  const paragraphs = aboutText.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean);
  return (
    <main className="site-main">
      <h1 className="page-title">About</h1>
      <div className="about">
        {aboutPhotoUrl ? (
          <div className="about-photo">
            {/* No stored dimensions for this photo, so a plain img keeps its own aspect ratio. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={aboutPhotoUrl} alt={artistName} />
          </div>
        ) : null}
        <div className="prose">
          {paragraphs.map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </div>
    </main>
  );
}
