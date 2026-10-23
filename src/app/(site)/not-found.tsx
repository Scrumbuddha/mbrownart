import Link from "next/link";

export default function SiteNotFound() {
  return (
    <main className="site-main">
      <div className="prose">
        <h1 className="page-title">This page isn&apos;t here</h1>
        <p><Link href="/">Back to the paintings</Link></p>
      </div>
    </main>
  );
}
