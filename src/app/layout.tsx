import type { Metadata } from "next";
import { Roboto } from "next/font/google";
import { getDb } from "@/lib/db/client";
import { getSettings } from "@/lib/db/settings";
import { SiteHeader } from "./_components/SiteHeader";
import "./globals.css";

const roboto = Roboto({
  weight: ["300", "400", "500"],
  subsets: ["latin"],
  display: "swap",
});

// The header shows the artist name from Settings, so read it per request.
export const revalidate = 0;

export const metadata: Metadata = {
  title: "M Brown Watercolors",
  description: "Original watercolor paintings and prints.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { artistName } = await getSettings(getDb());
  return (
    <html lang="en">
      <body className={roboto.className}>
        <SiteHeader artistName={artistName} />
        {children}
      </body>
    </html>
  );
}
