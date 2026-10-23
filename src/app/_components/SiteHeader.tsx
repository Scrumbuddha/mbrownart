"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Paintings" },
  { href: "/prints", label: "Prints" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

/** Public header. The Studio has its own menu, so this hides itself under /studio. */
export function SiteHeader({ artistName }: { artistName: string }) {
  const path = usePathname() ?? "/";
  if (path === "/studio" || path.startsWith("/studio/")) return null;
  const current = (href: string) => (href === "/" ? path === "/" || path.startsWith("/paintings/") : path === href);
  return (
    <header className="site-header">
      <Link href="/" className="site-name">{artistName}</Link>
      <nav aria-label="Main" className="site-nav">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={current(n.href) ? "page" : undefined}>
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
