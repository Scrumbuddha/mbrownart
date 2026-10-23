import Link from "next/link";

const NAV = [
  { href: "/", label: "Paintings" },
  { href: "/prints", label: "Prints" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

/** Public header: the artist name and the main menu. */
export function SiteHeader({ artistName }: { artistName: string }) {
  return (
    <header className="site-header">
      <Link href="/" className="site-name">{artistName}</Link>
      <nav aria-label="Main" className="site-nav">
        {NAV.map((n) => <Link key={n.href} href={n.href}>{n.label}</Link>)}
      </nav>
    </header>
  );
}
