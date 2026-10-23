"use client";

// Last-resort boundary: replaces the root layout, so it renders its own html and body.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#fff", color: "#222", fontFamily: "Roboto, Arial, sans-serif", fontWeight: 300 }}>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 16px" }}>
          <h1 style={{ fontSize: 24, fontWeight: 400 }}>Something went wrong</h1>
          <p>Please try again in a moment.</p>
          <p>
            <button type="button" onClick={reset} style={{ font: "inherit", padding: "8px 16px", border: "1px solid #333", background: "#fff", borderRadius: 4, cursor: "pointer" }}>
              Try again
            </button>
          </p>
        </main>
      </body>
    </html>
  );
}
