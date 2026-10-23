import Link from "next/link";
import { isStudioRequest } from "@/lib/auth/session";
import { signOut } from "./login/actions";

export const dynamic = "force-dynamic";

const link = { color: "#333", textDecoration: "none", fontSize: 15, padding: "6px 0" } as const;

export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  // The login page lives under /studio too; show the menu only once signed in.
  if (!(await isStudioRequest())) return <>{children}</>;
  return (
    <div>
      <nav
        aria-label="Studio"
        style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 20px", padding: "12px 16px", borderBottom: "1px solid #eee" }}
      >
        <Link href="/studio" style={{ ...link, fontWeight: 500 }}>Paintings</Link>
        <Link href="/studio/orders" style={link}>Orders</Link>
        <Link href="/studio/settings" style={link}>Settings</Link>
        <Link href="/" style={link}>View site</Link>
        <form action={signOut} style={{ marginLeft: "auto" }}>
          <button type="submit" style={{ ...link, background: "none", border: 0, fontFamily: "inherit", cursor: "pointer" }}>
            Sign out
          </button>
        </form>
      </nav>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px 64px" }}>{children}</div>
    </div>
  );
}
