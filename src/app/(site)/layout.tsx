import type { Metadata } from "next";
import { SiteHeader } from "@/app/_components/SiteHeader";
import { artistName } from "./data";

// The header shows the artist name from Settings, so read it per request.
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const name = await artistName();
  return { title: { default: `${name} Watercolors`, template: `%s · ${name} Watercolors` } };
}

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader artistName={await artistName()} />
      {children}
    </>
  );
}
