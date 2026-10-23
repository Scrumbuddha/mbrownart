import type { Metadata } from "next";
import { siteSettings } from "../data";

export const revalidate = 0;

export const metadata: Metadata = { title: "Contact" };

export default async function ContactPage() {
  const { contactEmail, instagramUrl } = await siteSettings();
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
