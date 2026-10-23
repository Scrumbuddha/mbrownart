# Watercolor Portfolio & Shop: Design

Date: 2026-10-22
Status: Draft, awaiting artist's approval

## Intent

A portfolio website for a watercolor artist that also sells their work.
Most sales are one-of-a-kind originals. A few paintings are also sold as
prints, which the artist makes and mails themselves. Payment goes through
the artist's existing PayPal account.

The artist wants to add and manage paintings themselves, without code and
without asking anyone for help. The site should feel light and airy, with
lots of white space, so the watercolors carry the page.

## Goals

- Show the whole body of work on a gallery-wall homepage.
- Let a buyer purchase an original or a print, and pay with PayPal or a
  debit/credit card without needing a PayPal account.
- Let the artist add, edit, hide, reorder, and mark paintings sold from a
  private page that works on a phone.
- Never sell the same original twice.

## Non-goals

- International shipping. The site sells to US addresses only.
- Payment methods other than PayPal. Cards are handled by PayPal's card
  button.
- Customer accounts, a multi-item cart, discount codes, or inventory
  tracking for prints. Prints are treated as always available.
- A blog, newsletter, or social feed.

## Anti-goals (these would mean failure even if the site technically works)

- An original sells twice, or a buyer pays a price other than the one
  shown on the site (for example, by tampering with the page).
- Adding a painting requires the artist to touch code, GitHub, or a
  terminal.
- The design competes with the paintings: heavy colors, busy layouts, or
  cropped artwork.

## Decided by the artist

- **Homepage: "gallery wall."** The artist's name and a short menu, then
  every visible painting in a clean grid. Under each painting: its title,
  then its price or "Sold". On a desktop the grid has 3 columns; it drops
  to 2 columns, then 1 on narrower screens. Never crop a painting. Show it
  at its own aspect ratio.
- **Font: Roboto** throughout, loaded from Google Fonts. Light weights
  (300 and 400), with 500 for the name and headings.
- **Selling both originals and prints.** Some paintings are original-only.
  Some also offer one print option.
- **The artist ships everything themselves.**
- **Shipping: a low flat fee, US only.** Start at $10 per order. The
  artist must be able to change this amount from the Studio page.
- **PayPal:** the artist already has a PayPal account.
- **The artist adds paintings themselves** through a private page.
- **Florida sales tax is collected.**
- **Hosting on Vercel Pro** (paid plan, because the free plan doesn't
  allow commercial use).
- **Domain: mbrownart.com.** At build time, confirm whether the artist
  already owns it. If not, buy it through Vercel. The site, Studio,
  and buyer emails all use this domain.

## Sales tax (Florida)

The artist is in Florida and decided to collect Florida sales tax.
Claude's calls on how, which the artist should confirm with an
accountant or the Florida Department of Revenue:

- Tax applies only to orders shipped to a Florida address. Out-of-state
  orders are not taxed. This assumes the artist is below Florida's
  remote-seller threshold for other states and has no obligation there.
- Rate: the 6% state rate plus the discretionary sales surtax of the
  county the order ships to. The surtax applies only to the first $5,000
  of a single item. Look the county up from the shipping ZIP using a
  bundled ZIP-to-county table built from the Department of Revenue's
  published data. Where a ZIP spans counties, use the higher rate. Keep
  the county rates in one data file so they are easy to update each
  January.
- Shipping is taxed along with the item, because buyers can't avoid the
  shipping charge. The accountant should confirm this.
- Flow: the PayPal order starts with no tax. The PayPal SDK's shipping
  address change callback calls the server. The server works out the
  tax from the ZIP and updates the order's tax and total, so the buyer
  sees the final total in PayPal before they pay. Capture re-checks the
  tax on the server.
- The painting page shows "Florida orders include sales tax, added at
  checkout." The thank-you page, the order record, and the Studio Orders
  list all show the tax as its own line.
- Studio Orders includes a simple export (CSV by month: date, county,
  taxable amount, tax collected) for filing returns.
- Studio Settings has an on/off switch for collecting tax.

## Decided by Claude (the artist okayed the overall plan; flagged here so the artist can check them)

- **Hosting:** Vercel. The artist already has a Vercel account.
- **Stack:** Next.js (App Router, TypeScript), deployed on Vercel.
- **Storage:** painting photos go in Vercel Blob. Painting records,
  orders, and settings go in a Postgres database provisioned through
  Vercel's storage integrations (Neon). The artist should not have to
  sign up for anything beyond what Vercel's dashboard provisions.
- **Studio login:** one password, stored as an environment variable. The
  site checks it and sets a signed, http-only session cookie that lasts
  30 days. Only one user exists: the artist. Rate-limit failed attempts.
- **Payments:** PayPal JavaScript SDK buttons (PayPal + card) on the
  painting page, backed by server-side PayPal Orders v2 calls:
  - *Create order* happens on the server. The server looks up the price
    and shipping from the database. It never trusts an amount sent from
    the browser.
  - *Hold (Claude's call):* for an original, *create order* places a
    15-minute hold on the painting in the same database transaction. The
    server refuses to create an order while the painting is sold or held
    by someone else. That buyer sees "Someone is checking out with this
    painting right now. Try again in a few minutes." A held painting
    still shows as available in the gallery. Holds expire by timestamp,
    so no cleanup job is needed.
  - *Capture* happens on the server and marks the painting sold. If the
    painting sold while the buyer was in checkout, the server refuses to
    capture, and the buyer sees "Sorry, this one just sold."
  - If a capture errors or times out, ask PayPal for the order's status
    before releasing the hold. Release it only if PayPal confirms no
    payment was taken. Also subscribe to PayPal's
    `PAYMENT.CAPTURE.COMPLETED` webhook. It records the order and marks
    the painting sold if the browser never came back, and it does
    nothing if the order is already recorded.
  - Collect the shipping address in PayPal's checkout and restrict it to
    the US.
  - Build against the PayPal sandbox first. Go live by switching the
    client ID and secret in Vercel's environment variables.
- **Sold originals stay in the gallery** as part of the portfolio, labeled
  "Sold". If the painting has prints, they remain for sale.
- **Painting status model (Claude's call).** Three independent settings
  per painting:
  - *Original:* For sale / Sold / Not for sale
  - *Print:* off, or on with a size and price
  - *Visible:* shown / hidden. Hidden works with any combination.

  Caption under the painting in the gallery:

  | Original | Print | Caption |
  |---|---|---|
  | For sale | any | `$420` |
  | Sold | on | `Sold · prints $45` |
  | Sold | off | `Sold` |
  | Not for sale | on | `Print $45` |
  | Not for sale | off | no price (portfolio only) |

  The Prints page lists every visible painting whose print is on.

## Pages

### Public

1. **Home / gallery wall:** as described above. Menu: Paintings · Prints ·
   About · Contact.
2. **Prints:** the same grid, filtered to paintings that offer a print.
3. **Painting page** (`/paintings/[slug]`): the painting large on the
   left (stacked on top on mobile), with these details on the right:
   - title; medium and paper; size; year
   - a line or two of description from the artist
   - purchase options as selectable rows: "Original (one of a kind)" with
     its price, and "Print, [size]" with its price if prints are offered.
     If the original has sold, its row shows "Sold" and can't be chosen.
   - the PayPal button and the debit/credit card button
   - a note: "$X flat shipping within the US. You'll get an email when it
     ships."
   - clicking the image opens it full screen.
4. **Thank-you page:** shown after payment. It confirms what was bought
   and says the artist will ship it soon.
5. **About:** a photo of the artist and a few paragraphs. The artist edits
   this from the Studio page.
6. **Contact:** the artist's email address as a mailto link. Optionally an
   Instagram link. There is no contact form.

The approved mockups are in `docs/superpowers/specs/mockups/`. In
`homepage-style.html`, the artist chose option A. `painting-page.html` is
the painting page. They are layout sketches: the colored blobs stand in
for paintings.

### Private: Studio (`/studio`)

This page must be usable on a phone.

- **Paintings list:** thumbnails in gallery order. The artist can drag to
  reorder, or use up/down buttons on mobile. Each painting shows a status:
  Available, Sold, or Hidden.
- **Add or edit a painting:**
  - photo upload (accept phone photos up to ~20 MB; resize on upload for
    web display and keep a large version for the full-screen view)
  - title, medium/paper, size, year, description
  - original: For sale / Sold / Not for sale, plus the original's price
  - a print toggle, with print size and print price fields
  - a visible/hidden toggle
  - buttons: Publish, Save as hidden
- **Orders:** a list of orders, newest first. Each shows the date, the
  buyer's name and shipping address, the item (original or print), and the
  amount. Each has a "Mark shipped" checkbox. When the artist marks an
  order shipped, the site emails the buyer a short "Your painting has
  shipped" note. (See open items below.)
- **Settings:** artist name, flat shipping fee, About text and photo,
  contact email, Instagram link.

## Visual style

- White background with near-black text (#222/#333) and muted gray
  captions (#777). The "Sold" label uses a soft red-brown (#b04a3a).
- Generous white space. The paintings are the only strong color on the
  page.
- No dark mode. The background stays white to present the art
  consistently.

## Left to the builder

- Database schema, project structure, image-resizing approach, and how
  the slug is generated.
- Exact breakpoints and spacing, within the style above.
- How reordering is stored.
- Test approach. At minimum, cover the server-side order flow: price
  comes from the server, an original can't be sold twice, and a failed
  capture releases the reservation.

## Open items

- About text and photos. Use placeholders until the artist provides
  them. Use "M Brown" as the placeholder name, from the domain.
- The "shipped" email to buyers is sent through Resend, from an address at
  mbrownart.com. Setup includes confirming the domain with Resend.
- PayPal API credentials: the artist will need to create a REST app in
  the PayPal Developer dashboard to get a client ID and secret. The build
  should include plain-language steps for this.
