# art-portfolio

Watercolor shop for mbrownart.com: a public gallery, PayPal checkout with Florida sales tax, and a password-protected Studio at `/studio` for managing paintings, settings and orders. Next.js (App Router, TypeScript), Neon Postgres via Drizzle, Vercel Blob, PayPal REST, Resend.

## Develop

```
npm install
npm test        # vitest run (uses an in-memory Postgres, no setup needed)
npm run dev     # http://localhost:3000
npm run build
```

Windows: if `node` or `npm` is not found, add `C:\Program Files\nodejs` to your PATH (or run `$env:Path="C:\Program Files\nodejs;$env:Path"` in PowerShell for the current window).

Running the site locally needs the environment variables listed in `docs/SETUP.md`, plus `npx drizzle-kit migrate` against your `DATABASE_URL`.

## Deploying and running the shop

See [docs/SETUP.md](docs/SETUP.md). It is written for the artist, not for developers.
