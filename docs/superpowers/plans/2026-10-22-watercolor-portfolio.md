# Watercolor Portfolio & Shop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build mbrownart.com, a gallery-wall portfolio for watercolors that sells originals and prints through PayPal. It has a private Studio page where the artist manages paintings, orders, and settings.

**Architecture:** A Next.js App Router app on Vercel Pro. Domain logic lives in plain TypeScript modules under `src/lib/`. These modules take a `Db` and a `PayPalApi` as arguments, so Vitest can run them against an in-memory Postgres (PGlite) and a fake PayPal. Pages, route handlers, and server actions are thin wrappers that pass in the real Neon database and the real PayPal REST client.

**Tech Stack:** Next.js 15 (App Router, TypeScript, `src/` dir), Drizzle ORM (`drizzle-orm/neon-serverless` in prod, `drizzle-orm/pglite` in tests), `@neondatabase/serverless`, `@electric-sql/pglite`, `@vercel/blob`, `sharp`, `jose`, `@paypal/react-paypal-js`, `resend`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-watercolor-portfolio-design.md`. Read it before starting any task. The mockups are in `docs/superpowers/specs/mockups/`.

## Global Constraints

- Store all money as integer cents (`number`). Never use floats for money. Format for display with `formatCents(cents) -> "$420"` (omit cents when they are zero).
- Never trust an amount from the browser. Every price, shipping charge, and tax amount comes from the database or is computed on the server.
- The default flat shipping fee is `1000` cents. US addresses only.
- Florida tax rate: 6% state, plus the delivery county's surtax on the first $5,000. Only orders shipped to FL are taxed. Shipping is taxed.
- Checkout hold on an original: 15 minutes (`HOLD_MS = 15 * 60 * 1000`).
- Studio session cookie: signed, httpOnly, secure, `sameSite=lax`, lasts 30 days. Login rate limit: 5 failed attempts per IP per 15 minutes.
- Font: Roboto from Google Fonts via `next/font/google`, weights 300/400/500. Colors: text `#222`/`#333`, captions `#777`, Sold label `#b04a3a`, background `#fff`. No dark mode.
- Never crop paintings. Render each one at its stored aspect ratio.
- Gallery grid: 3 columns on desktop, 2 below 900px, 1 below 560px.
- Windows dev box: `node`/`npm` are not on PATH. Prefix shell commands with `export PATH="/c/Program Files/nodejs:$PATH";` in Git Bash.
- Env vars: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `STUDIO_PASSWORD`, `SESSION_SECRET`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV` (`sandbox`|`live`), `PAYPAL_WEBHOOK_ID`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `RESEND_API_KEY`, `EMAIL_FROM` (e.g. `M Brown <studio@mbrownart.com>`), `SITE_URL`.

## Review Focus

1. **A hold expires while buyer A is still in PayPal, and buyer B starts and finishes checkout.** A's capture must be refused with `sold`, so the painting is not sold twice. Test: Task 5, `refuses capture when hold expired and another buyer bought it`.
2. **The PayPal button is double-clicked, or the capture endpoint is called twice** (or the webhook arrives after the browser capture). The second call must return the same paid order. It must not error, capture twice, or create a second order. Tests: Task 5 `capture is idempotent`, Task 6 `webhook after browser capture is a no-op`.
3. **A buyer picks a non-US address, or changes from a Florida address to a Georgia one in PayPal.** Non-US addresses are rejected. Changing the address recomputes tax down to 0. Tests: Task 5 `rejects non-US shipping`, `recomputes tax when address changes state`.
4. **The artist edits the price, hides the painting, or marks it sold by hand while a buyer is mid-checkout.** The buyer pays the amount locked into their order, or is refused if the painting was marked sold. Hiding does not break the checkout. Test: Task 5 `capture refused if artist marked sold mid-checkout`.
5. **An iPhone photo upload** (HEIC, or a JPEG over 10 MB with EXIF rotation). It must be rotated upright, resized, and stored. If the file can't be decoded, show a plain-language error instead of a crash. Test: Task 8 `processUpload rotates by EXIF and rejects undecodable file`.

---

### Task 1: Project scaffold, database schema, test harness

**Files:**
- Create: the Next.js app at the repo root (`package.json`, `tsconfig.json`, `next.config.ts`, `src/app/layout.tsx`, `.gitignore` including `.superpowers/` and `.env*.local`)
- Create: `src/lib/db/schema.ts`, `src/lib/db/client.ts`, `src/lib/db/test-db.ts`, `drizzle.config.ts`, `drizzle/` (generated migrations)
- Create: `vitest.config.ts`, `src/lib/money.ts`
- Test: `src/lib/db/schema.test.ts`, `src/lib/money.test.ts`

**Interfaces:**
- Produces:
  - `schema.ts` tables:
    - `paintings`: `id uuid pk default random`, `slug text unique not null`, `title`, `medium`, `size`, `year int`, `description text`, `imageUrl`, `imageLargeUrl`, `imageWidth int`, `imageHeight int`, `originalStatus text ('for_sale'|'sold'|'not_for_sale') default 'for_sale'`, `originalPriceCents int null`, `printEnabled bool default false`, `printSize text null`, `printPriceCents int null`, `visible bool default true`, `sortOrder int default 0`, `heldUntil timestamptz null`, `heldByOrderId uuid null`, `createdAt`, `updatedAt`
    - `orders`: `id uuid pk`, `paypalOrderId text unique null`, `paintingId uuid fk`, `item text ('original'|'print')`, `status text ('pending'|'paid'|'failed') default 'pending'`, `itemCents`, `shippingCents`, `taxCents int default 0`, `totalCents`, `taxCounty text null`, `buyerName text null`, `buyerEmail text null`, `shipTo jsonb null` (type `ShipTo`), `createdAt`, `paidAt null`, `shippedAt null`
    - `settings`: a single row with `id int pk = 1`: `artistName default 'M Brown'`, `shippingCents default 1000`, `taxEnabled default true`, `aboutText default ''`, `aboutPhotoUrl null`, `contactEmail default ''`, `instagramUrl null`
    - `loginAttempts`: `id serial`, `ip text`, `at timestamptz`
  - Exported types: `Painting`, `Order`, `Settings` (`$inferSelect`); `ShipTo = { name: string; line1: string; line2?: string; city: string; state: string; zip: string; country: string }`
  - `client.ts`: `type Db` (a Drizzle Postgres database typed with `schema`, usable for both drivers); `getDb(): Db`, a lazy singleton using the Neon `Pool` driver (it needs transactions, so not `neon-http`)
  - `test-db.ts`: `createTestDb(): Promise<Db>`, which runs the migrations in `drizzle/` on a fresh PGlite and inserts the settings row
  - `getSettings(db: Db): Promise<Settings>` in `src/lib/db/settings.ts`
  - `money.ts`: `formatCents(cents: number): string`

- [ ] **Step 1:** `git init`. Then run `npx create-next-app@15 . --ts --app --src-dir --eslint --no-tailwind --import-alias "@/*"` and install the tech stack packages, plus `drizzle-kit` and `vitest` as dev dependencies.
- [ ] **Step 2: Write failing tests.** In `schema.test.ts`, `createTestDb()` gives a db where `getSettings(db)` returns `{ shippingCents: 1000, taxEnabled: true, artistName: 'M Brown' }`. A painting inserted with only the required fields has `originalStatus === 'for_sale'` and `visible === true`. In `money.test.ts`: `formatCents(42000) === "$420"`, `formatCents(4550) === "$45.50"`, `formatCents(0) === "$0"`.
- [ ] **Step 3:** Run `npx vitest run`. Expected: FAIL (modules missing).
- [ ] **Step 4:** Write the schema, the clients, `getSettings`, and `formatCents`. Generate the migration with `npx drizzle-kit generate`.
- [ ] **Step 5:** Run `npx vitest run`. Expected: PASS. Run `npm run build`. Expected: success.
- [ ] **Step 6:** Commit: `git add -A && git commit -m "Scaffold Next.js app with schema and test harness"`

---

### Task 2: Painting queries and gallery captions

**Files:**
- Create: `src/lib/paintings/caption.ts`, `src/lib/paintings/queries.ts`
- Test: `src/lib/paintings/caption.test.ts`, `src/lib/paintings/queries.test.ts`

**Interfaces:**
- Consumes: `Db`, `Painting`, `formatCents`
- Produces:
  - `galleryCaption(p: Pick<Painting,'originalStatus'|'originalPriceCents'|'printEnabled'|'printPriceCents'>): { price: string | null; sold: boolean }`
  - `listGallery(db): Promise<Painting[]>`: visible paintings sorted by `sortOrder`, then `createdAt` descending
  - `listPrints(db): Promise<Painting[]>`: visible paintings with `printEnabled`, in the same order
  - `getPaintingBySlug(db, slug): Promise<Painting | null>`: returns `null` if the painting is hidden
  - `isOriginalPurchasable(p: Painting, now: Date): boolean`: true if `originalStatus === 'for_sale'` and the price is set. A hold does **not** make the painting look unavailable (per the spec).

- [ ] **Step 1: Write the failing tests.** These follow the spec's caption table exactly:
  ```ts
  expect(galleryCaption({originalStatus:'for_sale', originalPriceCents:42000, printEnabled:true, printPriceCents:4500})).toEqual({price:'$420', sold:false})
  expect(galleryCaption({originalStatus:'sold', originalPriceCents:42000, printEnabled:true, printPriceCents:4500})).toEqual({price:'prints $45', sold:true}) // rendered "Sold · prints $45"
  expect(galleryCaption({originalStatus:'sold', originalPriceCents:42000, printEnabled:false, printPriceCents:null})).toEqual({price:null, sold:true})
  expect(galleryCaption({originalStatus:'not_for_sale', originalPriceCents:null, printEnabled:true, printPriceCents:4500})).toEqual({price:'Print $45', sold:false})
  expect(galleryCaption({originalStatus:'not_for_sale', originalPriceCents:null, printEnabled:false, printPriceCents:null})).toEqual({price:null, sold:false})
  ```
  The query tests check that hidden paintings are excluded from all three queries, that `listPrints` excludes paintings without a print, and that results follow `sortOrder`.
- [ ] **Step 2:** Run `npx vitest run src/lib/paintings`. Expected: FAIL.
- [ ] **Step 3:** Implement the module.
- [ ] **Step 4:** Run `npx vitest run src/lib/paintings`. Expected: PASS.
- [ ] **Step 5:** Commit: `"Add painting queries and gallery captions"`

---

### Task 3: Florida sales tax

**Files:**
- Create: `scripts/build-fl-zip-county.ts` (a one-off data builder, committed), `src/lib/tax/fl-zip-county.json`, `src/lib/tax/fl-surtax.ts`, `src/lib/tax/florida.ts`
- Test: `src/lib/tax/florida.test.ts`

**Interfaces:**
- Produces:
  - `FL_SURTAX: Record<string, number>`: county name to surtax rate as a decimal (e.g. `Pinellas: 0.01`), with a header comment giving the source (Florida DOR form DR-15DSS for calendar year 2026) and a note to update it each January
  - `computeTax(input: { state: string; zip: string; itemCents: number; shippingCents: number; enabled: boolean }): { taxCents: number; county: string | null }`

**Data:** `fl-zip-county.json` maps each 5-digit ZIP to a list of county names. Build it with the script from the Census Bureau's 2020 ZCTA-to-county relationship file (`tab20_zcta520_county20_natl.txt`, keeping state FIPS 12). Download that file to the scratchpad; don't commit it. Fill `FL_SURTAX` by hand from DR-15DSS (all 67 counties), and give each entry the exact rate on the form.

**Algorithm (decided):**
```
if !enabled or state !== 'FL' -> {taxCents:0, county:null}
counties = zipCounty[zip.slice(0,5)] ?? []   // unknown FL ZIP -> state 6% only, county null
county = the county in the list with the highest FL_SURTAX rate
state = round(0.06 * (itemCents + shippingCents))
surtax = round(rate * min(itemCents + shippingCents, 500000))
taxCents = state + surtax     // round each half-up to the cent
```

- [ ] **Step 1: Write the failing tests.**
  - `computeTax({state:'FL', zip:'33701', itemCents:42000, shippingCents:1000, enabled:true})` returns `{taxCents: 3010, county:'Pinellas'}` (7% of $430)
  - `state:'GA'` returns `{taxCents:0, county:null}`
  - `enabled:false` returns 0
  - `itemCents:800000` in Pinellas: the surtax is capped, so `taxCents === round(0.06*801000) + round(0.01*500000)` = `48060 + 5000`
  - an unknown FL ZIP `'00000'` gives 6% only, with `county: null`
  - every county in `fl-zip-county.json` has an entry in `FL_SURTAX`
- [ ] **Step 2:** Run `npx vitest run src/lib/tax`. Expected: FAIL.
- [ ] **Step 3:** Build the data and implement `computeTax`.
- [ ] **Step 4:** Run `npx vitest run src/lib/tax`. Expected: PASS.
- [ ] **Step 5:** Commit: `"Add Florida sales tax calculation"`

---

### Task 4: PayPal REST client and fake

**Files:**
- Create: `src/lib/paypal/types.ts`, `src/lib/paypal/rest.ts`, `src/lib/paypal/fake.ts`
- Test: `src/lib/paypal/rest.test.ts` (with `fetch` mocked)

**Interfaces:**
- Produces:
  ```ts
  type Amounts = { itemCents: number; shippingCents: number; taxCents: number }
  type PayPalOrder = { id: string; status: 'CREATED'|'APPROVED'|'COMPLETED'|'VOIDED'|'PAYER_ACTION_REQUIRED'; totalCents: number; payer: { name: string; email: string } | null; shipTo: ShipTo | null }
  interface PayPalApi {
    createOrder(input: { referenceId: string; description: string } & Amounts): Promise<{ id: string }>
    updateAmounts(paypalOrderId: string, a: Amounts): Promise<void>
    captureOrder(paypalOrderId: string): Promise<PayPalOrder>
    getOrder(paypalOrderId: string): Promise<PayPalOrder>
    verifyWebhook(headers: Headers, rawBody: string): Promise<boolean>
  }
  createPayPalRest(env: { clientId; clientSecret; mode: 'sandbox'|'live'; webhookId }): PayPalApi
  createFakePayPal(): PayPalApi & { orders: Map<string, PayPalOrder>; approve(id: string, shipTo: ShipTo): void; failNextCapture(kind: 'declined'|'timeout-but-completed'): void }
  ```
- REST details: the base URL is `https://api-m.sandbox.paypal.com` or `https://api-m.paypal.com`. Get an OAuth token with client credentials and cache it until 60 seconds before it expires. `createOrder` posts to `/v2/checkout/orders` with `intent: 'CAPTURE'`, one purchase unit (`reference_id`, the amount with a `breakdown` of `item_total`/`shipping`/`tax_total`, all in USD as `"420.00"` strings), and `payment_source.paypal.experience_context.shipping_preference: 'GET_FROM_FILE'`. `updateAmounts` sends a `PATCH` that replaces `/purchase_units/@reference_id=='default'/amount`. Send a `PayPal-Request-Id` header (a uuid) on create and capture. `verifyWebhook` posts to `/v1/notifications/verify-webhook-signature` and returns `verification_status === 'SUCCESS'`.

- [ ] **Step 1: Write the failing tests.** `createOrder` sends a breakdown whose values sum to the total (`"430.00"` = `"420.00" + "10.00" + "0.00"`). The token is fetched once across two calls. `getOrder` maps PayPal's `purchase_units[0].shipping.address` (`address_line_1`, `admin_area_2`, `admin_area_1`, `postal_code`, `country_code`) to a `ShipTo`.
- [ ] **Step 2:** Run `npx vitest run src/lib/paypal`. Expected: FAIL.
- [ ] **Step 3:** Implement the REST client and the fake. The fake's `captureOrder` throws `new Error('declined')` for `declined`. For `timeout-but-completed`, it sets the order to COMPLETED and then throws `new Error('timeout')`.
- [ ] **Step 4:** Run `npx vitest run src/lib/paypal`. Expected: PASS.
- [ ] **Step 5:** Commit: `"Add PayPal REST client and test fake"`

---

### Task 5: Checkout service (hold, tax update, capture)

**Files:**
- Create: `src/lib/checkout/service.ts`, `src/lib/checkout/errors.ts`
- Test: `src/lib/checkout/service.test.ts`

**Interfaces:**
- Consumes: `Db`, `PayPalApi`, `computeTax`, `getSettings`, `HOLD_MS`
- Produces:
  ```ts
  class CheckoutError extends Error { code: 'sold'|'held'|'unavailable'|'not_us'|'amount_mismatch'|'payment_failed' }
  startCheckout(db, pp, input: { paintingId: string; item: 'original'|'print' }, now: Date): Promise<{ paypalOrderId: string }>
  updateShipping(db, pp, input: { paypalOrderId: string; country: string; state: string; zip: string }): Promise<Amounts>
  completeCheckout(db, pp, paypalOrderId: string, now: Date): Promise<Order>   // returns the paid order
  recordPaidOrder(db, paypalOrder: PayPalOrder, orderRow: Order, now: Date): Promise<Order>  // idempotent; shared with the webhook
  ```
- Buyer-facing copy for each code, exported as `CHECKOUT_MESSAGES` (exact text from the spec):
  - `held`: "Someone is checking out with this painting right now. Try again in a few minutes."
  - `sold`: "Sorry, this one just sold."
  - `not_us`: "Sorry, we can only ship within the US."
  - `unavailable` / `amount_mismatch` / `payment_failed`: "Something went wrong and you were not charged. Please try again."

**Behavior (decided):**
- `startCheckout`:
  1. Load the painting and settings. Throw `unavailable` if the painting is hidden, if `item==='print'` and no print is offered, or if `item==='original'` and the original is `not_for_sale` or has no price. Throw `sold` if the original is sold.
  2. Insert a `pending` order with the item/shipping amounts locked in and `taxCents: 0`.
  3. For an original, place the hold with a single atomic statement: `UPDATE paintings SET held_until = now+HOLD_MS, held_by_order_id = :orderId WHERE id = :id AND original_status = 'for_sale' AND (held_until IS NULL OR held_until < now)`. If no row is updated, mark the order `failed` and throw `held`.
  4. Call `pp.createOrder({ referenceId: orderId, ... })` and save the `paypalOrderId`. If PayPal throws, release the hold, mark the order `failed`, and throw `payment_failed`.
- `updateShipping`: throw `not_us` if `country !== 'US'`. Otherwise compute tax from the order's locked amounts, save `taxCents`/`taxCounty`/`totalCents`, and call `pp.updateAmounts`. Skip the order if it isn't `pending`.
- `completeCheckout`:
  1. If the order is already `paid`, return it (idempotent).
  2. Otherwise `pp.getOrder`. Recompute tax from its `shipTo`. If the tax differs from the stored tax, update the order and PayPal first. Throw `amount_mismatch` if PayPal's `totalCents` still differs from the order's `totalCents`.
  3. For an original, the painting must be `for_sale` and either held by this order or not held by anyone else (hold expired). If it is sold or held by another order, mark this order `failed` and throw `sold`. Do not capture.
  4. `pp.captureOrder`, then `recordPaidOrder`.
  5. If capture throws: `pp.getOrder`. If its status is `COMPLETED`, call `recordPaidOrder` and return it. Otherwise release the hold if this order holds it, mark the order `failed`, and throw `payment_failed`.
- `recordPaidOrder`: in a single transaction, if the order is already paid, return it. Otherwise set the order to `paid` with the buyer name, email, `shipTo`, and `paidAt`. For an original, set the painting to `originalStatus='sold'` and clear the hold.

- [ ] **Step 1: Write the failing tests.** Use `createTestDb` and `createFakePayPal`, and pass in `now` directly.
  - `holds an original and creates a PayPal order with locked amounts`: the painting has `heldByOrderId` set, and the fake order total is 43000
  - `second buyer gets held while first holds it`: throws `held`
  - `second buyer can start after hold expires`: `now + 16min` succeeds
  - `print checkout does not hold the painting and works when original is sold`
  - `rejects non-US shipping`: `updateShipping` with `country: 'CA'` throws `not_us`
  - `recomputes tax when address changes state`: FL 33701 gives `taxCents` 3010, then GA gives 0, and `pp.updateAmounts` was called both times
  - `completes: order paid, original sold, hold cleared`
  - `capture is idempotent`: a second `completeCheckout` returns the same order, and the fake shows one capture
  - `refuses capture when hold expired and another buyer bought it` (Review Focus 1): A starts, B starts at +16 minutes and completes, then A's `completeCheckout` throws `sold` and the fake shows no capture for A
  - `capture refused if artist marked sold mid-checkout` (Review Focus 4)
  - `price edit mid-checkout does not change charged amount` (Review Focus 4)
  - `declined capture releases hold and marks failed`
  - `timeout-but-completed capture is recorded as paid, not released`
  - `refuses print checkout when print disabled`: throws `unavailable`
- [ ] **Step 2:** Run `npx vitest run src/lib/checkout`. Expected: FAIL.
- [ ] **Step 3:** Implement the service as described above.
- [ ] **Step 4:** Run `npx vitest run src/lib/checkout`. Expected: PASS.
- [ ] **Step 5:** Commit: `"Add checkout service with holds and server-side pricing"`

---

### Task 6: Checkout API routes and PayPal webhook

**Files:**
- Create: `src/lib/paypal/server.ts` (`getPayPal(): PayPalApi`, which builds the REST client from env), `src/app/api/checkout/create/route.ts`, `src/app/api/checkout/shipping/route.ts`, `src/app/api/checkout/capture/route.ts`, `src/app/api/paypal/webhook/route.ts`, `src/lib/checkout/webhook.ts`
- Test: `src/lib/checkout/webhook.test.ts`

**Interfaces:**
- Consumes: the Task 5 functions, `CHECKOUT_MESSAGES`, `getDb`
- Produces:
  - `POST /api/checkout/create` with body `{ paintingId, item }` returns `200 { paypalOrderId }`, or `409 { code, message }`
  - `POST /api/checkout/shipping` with body `{ paypalOrderId, country, state, zip }` returns `200 Amounts`, or `422 { code:'not_us', message }`
  - `POST /api/checkout/capture` with body `{ paypalOrderId }` returns `200 { orderId }`, or `409 { code, message }`
  - `POST /api/paypal/webhook` returns 200 after a valid signature (and still 200 for event types it ignores), or 400 for an invalid signature
  - `handleWebhookEvent(db, pp, event: { event_type: string; resource: any }, now): Promise<'recorded'|'ignored'|'already-paid'>`. It handles `PAYMENT.CAPTURE.COMPLETED` by reading `resource.supplementary_data.related_ids.order_id`, finding the order by `paypalOrderId`, calling `pp.getOrder`, then `recordPaidOrder`.
- Validate each route body's shape. A malformed body returns 400 with the generic message. Routes set `export const runtime = 'nodejs'`.

- [ ] **Step 1: Write the failing tests.**
  - `webhook records a paid order when browser never returned`: start a checkout, have the fake complete the order, call `handleWebhookEvent`, and the order is paid and the original sold
  - `webhook after browser capture is a no-op` (Review Focus 2): returns `'already-paid'`
  - `unknown event type ignored`
- [ ] **Step 2:** Run `npx vitest run src/lib/checkout/webhook.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `handleWebhookEvent` and the four routes.
- [ ] **Step 4:** Run `npx vitest run`. Expected: PASS. Run `npm run build`. Expected: success.
- [ ] **Step 5:** Commit: `"Add checkout API routes and PayPal webhook"`

---

### Task 7: Studio login

**Files:**
- Create: `src/lib/auth/session.ts`, `src/lib/auth/rate-limit.ts`, `src/middleware.ts`, `src/app/studio/login/page.tsx`, `src/app/studio/login/actions.ts`
- Test: `src/lib/auth/session.test.ts`, `src/lib/auth/rate-limit.test.ts`

**Interfaces:**
- Produces:
  - `createSessionToken(secret: string, now: Date): Promise<string>`: a jose HS256 JWT with `sub:'artist'` that expires in 30 days
  - `verifySessionToken(secret: string, token: string | undefined, now: Date): Promise<boolean>`
  - `SESSION_COOKIE = 'studio_session'`
  - `checkPassword(input: string, expected: string): boolean`: a timing-safe comparison
  - `isRateLimited(db, ip, now): Promise<boolean>` (true after 5 failures in 15 minutes), and `recordFailure(db, ip, now)`
  - `requireStudio(): Promise<void>`, for server actions and route handlers to call. It reads the cookie and throws/redirects if the session is invalid. The middleware protects `/studio/:path*` and `/api/studio/:path*`, except `/studio/login`.
- Login page: a single password field and a "Sign in" button. Errors: "That password isn't right." / "Too many tries. Wait 15 minutes and try again."

- [ ] **Step 1: Write the failing tests.** A token verifies with the right secret, fails with the wrong secret, and fails 31 days later. `checkPassword` works. After 5 `recordFailure` calls, `isRateLimited` is true, and it is false again 16 minutes later.
- [ ] **Step 2:** Run `npx vitest run src/lib/auth`. Expected: FAIL.
- [ ] **Step 3:** Implement the auth module, the middleware, and the login page/action. On success, set the cookie with the Global Constraints attributes and redirect to `/studio`.
- [ ] **Step 4:** Run `npx vitest run src/lib/auth`. Expected: PASS.
- [ ] **Step 5:** Commit: `"Add Studio password login"`

---

### Task 8: Studio painting management and photo upload

**Files:**
- Create: `src/lib/paintings/admin.ts`, `src/lib/images/process.ts`, `src/app/studio/page.tsx` (the paintings list), `src/app/studio/paintings/new/page.tsx`, `src/app/studio/paintings/[id]/page.tsx`, `src/app/studio/paintings/actions.ts`, `src/app/studio/_components/PaintingForm.tsx`, `src/app/studio/_components/PaintingList.tsx`, `src/app/studio/layout.tsx` (Studio nav: Paintings · Orders · Settings · View site · Sign out)
- Test: `src/lib/paintings/admin.test.ts`, `src/lib/images/process.test.ts`, with fixtures in `src/lib/images/__fixtures__/` (a small JPEG with EXIF orientation 6, and a garbage `.heic`)

**Interfaces:**
- Consumes: `Db`, `Painting`, `requireStudio`
- Produces:
  - `type PaintingInput = { title; medium; size; year: number|null; description; originalStatus; originalPriceCents: number|null; printEnabled; printSize: string|null; printPriceCents: number|null; visible: boolean }`
  - `validatePaintingInput(raw: FormData-like): { ok: true; value: PaintingInput } | { ok: false; errors: Record<string,string> }`. Rules: a title is required. `originalStatus==='for_sale'` requires a price above 0. `printEnabled` requires a print size and a price above 0. Prices are entered in dollars (`"420"` or `"45.50"`) and converted to cents.
  - `createPainting(db, input, image: ProcessedImage): Promise<Painting>`. It makes the slug from the title, and adds `-2`, `-3`, etc. if the slug is taken. New paintings go to the top (`sortOrder = min - 1`).
  - `updatePainting(db, id, input, image?: ProcessedImage)`, `movePainting(db, id, direction: 'up'|'down')`, `setOrder(db, ids: string[])`
  - `processUpload(file: Buffer): Promise<{ web: Buffer; large: Buffer; width: number; height: number }>`. Uses sharp: `.rotate()` to apply EXIF orientation, a 1200px long edge for `web` and 2400px for `large`, JPEG quality 85, metadata stripped. Throws `new UploadError("We couldn't read that photo. Try saving it as a JPEG and uploading again.")` if the file can't be decoded.
  - `type ProcessedImage = { imageUrl; imageLargeUrl; imageWidth; imageHeight }`. The server action uploads both buffers with `@vercel/blob` `put(..., { access: 'public', addRandomSuffix: true })`.
- Next config: set `experimental.serverActions.bodySizeLimit = '25mb'` (to allow photos up to ~20 MB).
- Form UI: the fields from the spec's Studio section, with **Publish** (saves as visible) and **Save as hidden** buttons. The list shows thumbnails, a status badge (For sale / Sold / Not for sale, plus Hidden), drag-to-reorder on desktop, and up/down buttons that also show on mobile. Everything works at 375px wide.

- [ ] **Step 1: Write the failing tests.**
  - validation: for-sale with no price gives an error on `originalPriceCents`; `"45.50"` becomes 4550; print enabled with no size gives an error
  - `createPainting` slugs: "Harbor Light" twice gives `harbor-light` then `harbor-light-2`
  - a new painting appears first in `listGallery`; `movePainting` swaps neighbors
  - `processUpload rotates by EXIF and rejects undecodable file` (Review Focus 5): the orientation-6 fixture, 400×200 as stored, comes out with height > width. The garbage file throws `UploadError`.
- [ ] **Step 2:** Run `npx vitest run src/lib/paintings src/lib/images`. Expected: FAIL.
- [ ] **Step 3:** Implement the admin module, image processing, server actions (each calls `requireStudio()` first), and the Studio pages.
- [ ] **Step 4:** Run `npx vitest run`. Expected: PASS. Run `npm run build`. Expected: success.
- [ ] **Step 5:** Commit: `"Add Studio painting management and photo upload"`

---

### Task 9: Studio orders, shipped email, tax export, and settings

**Files:**
- Create: `src/lib/orders/admin.ts`, `src/lib/orders/tax-csv.ts`, `src/lib/email/shipped.ts`, `src/app/studio/orders/page.tsx`, `src/app/studio/orders/actions.ts`, `src/app/api/studio/tax-export/route.ts`, `src/app/studio/settings/page.tsx`, `src/app/studio/settings/actions.ts`
- Test: `src/lib/orders/admin.test.ts`, `src/lib/orders/tax-csv.test.ts`

**Interfaces:**
- Consumes: `Db`, `Order`, `Painting`, `requireStudio`
- Produces:
  - `listPaidOrders(db): Promise<(Order & { paintingTitle: string })[]>`, newest first. `pending` and `failed` orders are never shown.
  - `markShipped(db, orderId, now, send: (o) => Promise<void>): Promise<void>`. It sets `shippedAt`, then calls `send`. If the order is already shipped, it does nothing and doesn't send again. If `send` throws, `shippedAt` stays set, and the action shows "Marked shipped, but the email to the buyer didn't send."
  - `sendShippedEmail(order, painting, settings)`: uses Resend from `EMAIL_FROM` to `order.buyerEmail`. Subject: `Your painting is on its way`. The body names the painting and the item (original/print), and is signed with `settings.artistName`.
  - `taxCsv(orders: Order[], month: string /* 'YYYY-MM' */): string`. Header: `date,county,taxable_amount,tax_collected`. One row per paid order in that month that has `taxCents > 0`. Amounts are in dollars with 2 decimals. The taxable amount is item plus shipping.
  - `updateSettings(db, patch: Partial<Settings>)`. The settings form takes the shipping fee in dollars, plus the tax on/off switch, artist name, about text and photo (stored in Blob via the Task 8 `processUpload`), contact email, and Instagram URL.
  - `GET /api/studio/tax-export?month=YYYY-MM` returns `text/csv` with `Content-Disposition: attachment; filename="tax-YYYY-MM.csv"`.
- Orders page: each order shows the date, buyer name and address, item, painting, item/shipping/tax/total, and a "Mark shipped" checkbox. A month picker and a "Download tax report" link sit at the top.

- [ ] **Step 1: Write the failing tests.** `listPaidOrders` excludes pending and failed orders. `markShipped` calls `send` once even when called twice. `taxCsv` for `2026-11` with one FL order (item 42000, shipping 1000, tax 3010, Pinellas) outputs `2026-11-03,Pinellas,430.00,30.10`. A GA order with 0 tax is excluded.
- [ ] **Step 2:** Run `npx vitest run src/lib/orders`. Expected: FAIL.
- [ ] **Step 3:** Implement the modules, pages, and actions.
- [ ] **Step 4:** Run `npx vitest run`. Expected: PASS. Run `npm run build`. Expected: success.
- [ ] **Step 5:** Commit: `"Add Studio orders, shipped email, tax export, settings"`

---

### Task 10: Public site

**Files:**
- Create: `src/app/layout.tsx` (Roboto, header with the artist name and nav: Paintings · Prints · About · Contact), `src/app/globals.css`, `src/app/page.tsx`, `src/app/prints/page.tsx`, `src/app/paintings/[slug]/page.tsx`, `src/app/paintings/[slug]/BuyBox.tsx` (client), `src/app/thank-you/page.tsx`, `src/app/about/page.tsx`, `src/app/contact/page.tsx`, `src/app/_components/GalleryGrid.tsx`, `src/app/_components/Lightbox.tsx`
- Test: `src/app/_components/GalleryGrid.test.tsx` (Vitest + `@testing-library/react`, jsdom)

**Interfaces:**
- Consumes: `listGallery`, `listPrints`, `getPaintingBySlug`, `galleryCaption`, `getSettings`, `formatCents`, the Task 6 checkout routes, `CHECKOUT_MESSAGES`
- Produces: the public pages. Pages read from the db at request time with `export const revalidate = 0`. Studio actions call `revalidatePath('/')` after changes.
- Layout: match `docs/superpowers/specs/mockups/homepage-style.html` option A and `painting-page.html`, using the Global Constraints colors, font, and grid breakpoints. Images use `next/image` with the stored width and height (no cropping), and `sizes` set to match the grid.
- `GalleryGrid({ paintings })`: each tile links to `/paintings/[slug]` and shows the title, then the caption. When `sold`, render a red "Sold" label followed by `· {price}` if a price is set.
- Painting page: the details from spec Pages §3. Option rows are radio buttons: "Original (one of a kind)", and "Print, {printSize}" if a print is offered. A sold original shows "Sold" and is disabled. A painting with nothing for sale shows no buy box. Under the options: "{formatCents(shipping)} flat shipping within the US. You'll get an email when it ships." When tax is enabled, also: "Florida orders include sales tax, added at checkout."
- `BuyBox`: `PayPalScriptProvider` with `{ clientId: NEXT_PUBLIC_PAYPAL_CLIENT_ID, currency: 'USD', intent: 'capture', components: 'buttons', 'enable-funding': 'card' }`. It renders the PayPal button and the card button using `PayPalButtons` with `fundingSource` set to `paypal` and `card`. Wiring:
  - `createOrder` calls `/api/checkout/create`
  - `onShippingAddressChange` calls `/api/checkout/shipping`. On a 422, call `actions.reject(data.errors.COUNTRY_ERROR)`.
  - `onApprove` calls `/api/checkout/capture`, then `router.push('/thank-you?order=' + orderId)`
  - Any 409 shows `message` above the buttons.
- Thank-you page: looks up a paid order by its id and shows the item, the painting title, the item/shipping/tax/total lines, and "Thank you! I'll pack it up and ship it soon. You'll get an email when it's on its way." If the order is missing or not paid, show a neutral "Thanks for visiting" with a link home.
- About: renders `settings.aboutText` as paragraphs (split on blank lines), with the photo if set. Contact: a `mailto:` link, plus Instagram if set.

- [ ] **Step 1: Write the failing test.** `GalleryGrid` renders "$420" for a for-sale painting, "Sold" and "prints $45" for a sold painting with prints, and links to `/paintings/harbor-light`.
- [ ] **Step 2:** Run `npx vitest run src/app`. Expected: FAIL.
- [ ] **Step 3:** Implement the pages and components.
- [ ] **Step 4:** Run `npx vitest run`. Expected: PASS. Run `npm run build`. Expected: success.
- [ ] **Step 5: Manual check.** Run `npm run dev` with sandbox env vars and a Neon dev branch. Add a painting in Studio, then buy it with a PayPal sandbox buyer account using a Florida address. Confirm the 7% tax in Pinellas, the Sold label, and the order in Studio. Change the address to Georgia and confirm the tax drops to 0. Check every page at 375px wide.
- [ ] **Step 6:** Commit: `"Add public gallery, painting pages, and PayPal checkout"`

---

### Task 11: Setup guide and deployment

**Files:**
- Create: `docs/SETUP.md`, `README.md`

**Interfaces:**
- Consumes: the env var list in Global Constraints
- Produces: plain-language, numbered steps for the artist, with no jargon left unexplained:
  1. Vercel: create the project from the repo and switch the team to Pro. Add storage: Neon Postgres (this sets `DATABASE_URL`) and Blob (this sets `BLOB_READ_WRITE_TOKEN`).
  2. Run the migrations: `npx drizzle-kit migrate` against `DATABASE_URL`.
  3. Domain: buy or connect mbrownart.com in Vercel, then set `SITE_URL=https://mbrownart.com`.
  4. PayPal: in developer.paypal.com, create a REST app (Sandbox first, then Live) and copy the client ID and secret. Add a webhook pointing to `https://mbrownart.com/api/paypal/webhook` for `PAYMENT.CAPTURE.COMPLETED`, and copy its ID.
  5. Resend: add and verify the mbrownart.com domain (Vercel DNS records), then create an API key.
  6. Set `STUDIO_PASSWORD` and `SESSION_SECRET` (`openssl rand -base64 32`).
  7. Going live: switch `PAYPAL_ENV=live` and the live keys, then redeploy.
  8. Each January: update the county rates in `src/lib/tax/fl-surtax.ts` from the new DR-15DSS.
  9. Ask an accountant to confirm the tax approach (from the spec).

- [ ] **Step 1:** Write `docs/SETUP.md` and a short `README.md` (what the project is, how to run tests, a link to SETUP).
- [ ] **Step 2:** Run `npx vitest run && npm run build`. Expected: all tests pass and the build succeeds.
- [ ] **Step 3:** Commit: `"Add setup guide"`
