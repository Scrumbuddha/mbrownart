# Setting up your shop

This guide takes you from "the code exists" to "people can buy a painting at mbrownart.com". You do not need to write code. Most steps are clicking and copy-and-paste. Two steps need a developer (or Claude) and say so.

Words used here:

- **Environment variable**: a private setting you paste into Vercel, like a name and a value. The site reads them while it runs. Never share them or put them in an email.
- **Deploy / redeploy**: Vercel builds the latest version of the site and puts it online. After you change an environment variable, you must redeploy for the change to take effect.
- **Sandbox**: PayPal's pretend mode. Fake accounts, fake money. Use it to practice. **Live** is real money.
- **Migration**: a one-time command that creates the tables (like empty spreadsheets) the shop stores paintings and orders in.

Set aside about two hours. Keep a notes file open to paste values into as you go.

## Before you start

- You need a Vercel account and a PayPal Business account (you have both).
- Vercel **Pro** is required. The free plan does not allow commercial use. It costs a monthly fee.
- The project must be in a GitHub repository that your Vercel account can see. A developer or Claude can do this.

## Step 1. Create the Vercel project and switch to Pro

1. Log in at vercel.com. Click **Add New... > Project**.
2. Pick the project's repository from the list and click **Import**. The first deploy may fail until the settings below are added. That is fine.
3. Upgrade: click your team name (top left) > **Settings > Billing**, and choose **Pro**.

### Add storage

1. Open your project, then the **Storage** tab.
2. Click **Create Database**, choose **Neon (Postgres)**, accept the defaults and connect it to the project. This adds the environment variable `DATABASE_URL` for you.
3. Click **Create** again and choose **Blob**. When asked for access, choose **Public** (the site shows the photos to everyone). Connect it to the project. This adds `BLOB_READ_WRITE_TOKEN` for you (it is where your painting photos are kept; the Studio's photo uploads need this token).
4. Confirm both appear under **Settings > Environment Variables**.

## Step 2. Create the database tables (run the migrations)

This step is run once, on a computer with the project downloaded and Node.js installed. Ask a developer or Claude to do it with you.

1. In Vercel, go to **Settings > Environment Variables**, find `DATABASE_URL`, reveal it, and copy it.
2. Open a terminal in the project folder. On Windows PowerShell:

   ```
   $env:DATABASE_URL = "paste-the-value-here"
   npx drizzle-kit migrate
   ```

   On Mac or Linux: `DATABASE_URL="paste-the-value-here" npx drizzle-kit migrate`
3. It applies the four files in the `drizzle` folder (0000 to 0003) and finishes without errors. This creates the tables and one starting row of Studio settings.

## Step 3. Connect mbrownart.com

1. In your project, go to **Settings > Domains** and click **Add**.
2. If you already own mbrownart.com, enter it and follow Vercel's instructions to change its DNS records (the records are shown on screen; you paste them at your domain registrar). If you do not own it, buy it through Vercel's **Domains** page.
3. Add `mbrownart.com` and, when asked, `www.mbrownart.com` (set one to redirect to the other).

## Step 4. PayPal

You will do this twice: first in **Sandbox** (practice), later in **Live**.

1. Go to developer.paypal.com and log in with your PayPal account.
2. Click **Apps & Credentials**. Make sure the toggle at the top says **Sandbox**.
3. Click **Create App**. Name it "mbrownart shop" and choose type **Merchant**.
4. On the app page, copy the **Client ID** and click **Show** to copy the **Secret**.
5. Add these in Vercel (**Settings > Environment Variables**):

   | Name | Value |
   |---|---|
   | `PAYPAL_CLIENT_ID` | the Client ID |
   | `NEXT_PUBLIC_PAYPAL_CLIENT_ID` | the same Client ID again (the site's buttons need it) |
   | `PAYPAL_CLIENT_SECRET` | the Secret |
   | `PAYPAL_ENV` | `sandbox` |

6. In Apps & Credentials, scroll to **Webhooks** and click **Add Webhook**. A webhook is PayPal telling your site "a payment went through".
   - Webhook URL: `https://mbrownart.com/api/paypal/webhook`
   - Event: tick **Payment capture completed** (`PAYMENT.CAPTURE.COMPLETED`).
   - Save, then copy the **Webhook ID** shown.
7. Add `PAYPAL_WEBHOOK_ID` in Vercel with that ID.

Sandbox and Live each have their own Client ID, Secret and Webhook ID. Don't mix them.

For testing you also need a pretend buyer. In developer.paypal.com go to **Testing Tools > Sandbox Accounts**; a "Personal" (buyer) account is usually already there. Click it to see its email and password.

## Step 5. Resend (the service that sends your emails)

Your site emails buyers when you mark an order shipped.

1. Create an account at resend.com.
2. Go to **Domains > Add Domain**, enter `mbrownart.com`.
3. Resend lists some DNS records. In Vercel, go to **Domains**, click mbrownart.com, **DNS Records**, and add each record exactly as shown. Back in Resend, click **Verify**. It can take from a few minutes to a few hours.
4. Go to **API Keys > Create API Key** (permission: Sending access). Copy it right away; it is shown once.
5. Add in Vercel:
   - `RESEND_API_KEY`: the key
   - `EMAIL_FROM`: how the sender appears, for example `M Brown <studio@mbrownart.com>`

## Step 6. Studio password and secret

1. `STUDIO_PASSWORD`: pick a long password only you know. This is what you type at mbrownart.com/studio.
2. `SESSION_SECRET`: a long random string, **at least 32 characters**. If it is shorter or missing, the Studio login refuses everyone (this is deliberate, for safety). To make one, ask a developer or Claude to run `openssl rand -base64 32` and paste the result, or use a password manager's "generate a 40 character password" option.
3. Add both in Vercel.

## Step 7. Deploy and look around (Sandbox mode)

1. In Vercel, open the **Deployments** tab, click the three dots on the latest deployment, and choose **Redeploy**.
2. When it finishes, visit `https://mbrownart.com/studio` and log in with your password.
3. First tasks:
   1. **Settings**: enter your name, **contact email (required)**, the shipping fee charged on every order, the **Collect Florida sales tax** switch (leave it on), your About text, and optionally a photo and Instagram link. Save.
   2. **Add paintings**: add a photo, title and price for each. Check them on the public site.

## Step 8. Go-live checklist (required, do not skip)

Do all of this in **Sandbox** mode first (`PAYPAL_ENV` is `sandbox`). Use your sandbox buyer account to pay. Use test paintings you can delete afterwards.

1. **PayPal button, Pinellas.** On a painting page, click the PayPal button and log in with the sandbox buyer account. Set the shipping address to a Pinellas County ZIP, for example **33701** (St. Petersburg). Confirm the PayPal window shows **7% sales tax added BEFORE you press Pay** (6% state plus 1% county). Pay. Then confirm the painting shows **Sold**.
2. **Debit or Credit Card button.** Do the same with another test painting using the **Debit or Credit Card** button (sandbox offers test card numbers under Testing Tools > Credit Card Generator). Confirm the tax appears **before** you pay. **If the card window does not show the tax, or the payment is refused, STOP. Do not go live. Get help from a developer or Claude first.**
3. **Georgia address.** Start another purchase and change the address to a Georgia ZIP (for example 30301). Confirm the tax drops to **$0**.
4. **Outside the US.** Try an address in another country. Confirm it is **refused**.
5. **Shipped email.** In the Studio, open **Orders** and tick **Shipped** on a test order. Confirm the email arrives in the buyer's inbox.
6. **Tax report.** On the Orders page, pick the month and click **Download tax report**. Open the file and confirm the test sale appears with the right tax.
7. **Studio on your phone.** On your phone, open `https://mbrownart.com/studio` and log in. Add a painting using a **full-size photo straight from your phone** (pick it from your photo library as it is, not a shrunk or emailed copy). Confirm it saves and shows on the site. Then **edit** it (for example change the title) and **reorder** it (move it up or down in the list). Confirm each change shows on the site. If the photo does not upload, **STOP** and get help from a developer or Claude.

### Switching to Live

1. At developer.paypal.com, flip the toggle at the top to **Live**. Create a Live app and a Live webhook exactly as in Step 4 (same URL, same event).
2. In Vercel (**Settings > Environment Variables**), replace `PAYPAL_CLIENT_ID`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` and `PAYPAL_WEBHOOK_ID` with the **Live** values, and set `PAYPAL_ENV` to `live`. Set them for the **Production** environment (tick Production when saving). Replace all four together: a sandbox `PAYPAL_WEBHOOK_ID` with live keys makes webhooks fail, so payments will not be recorded properly.
3. **Redeploy** (Step 7, item 1). Changed settings do nothing until you redeploy.
4. Remove test paintings and orders you do not want public.
5. Make one small real purchase (for example a print), confirm it appears in Studio Orders, then refund it in PayPal.

## Everyday use: the Orders page

- **"Refund needed ..." banner**: rarely, two people pay for the same original at nearly the same time. The first buyer gets the painting. Open PayPal and refund the second buyer in full, then let them know.
- **"Please check this payment in PayPal ..." banner**: the amount PayPal reports paid did not match the order. Open that payment in PayPal, compare it with the order, and sort it out there (refund, or contact the buyer). Hold off shipping until you are satisfied.
- **Send email again**: if you mark an order shipped and the email fails, click this to try again.
- **Download tax report**: choose a month and download a spreadsheet (CSV) of date, county, taxable amount and tax collected, for your Florida return.

## Each January: update county tax rates (needs a developer or Claude)

County sales tax rates change. The file `src/lib/tax/fl-surtax.ts` holds them. **This is a code change plus a redeploy, so it needs a developer or Claude.**

1. Each new year, the Florida Department of Revenue publishes form DR-15DSS (Discretionary Sales Surtax Information) at https://floridarevenue.com/Forms_library/current/ . Find the form for the new calendar year.
2. Ask a developer or Claude to update `src/lib/tax/fl-surtax.ts` from it, then redeploy.
3. These four counties have surtaxes ending **12/31/2026** (per the 2026 DR-15DSS): **Brevard** 1% (two 0.5% surtaxes, both end) drops to 0%; **Charlotte** 1% drops to 0%; **Liberty** 1.5% (1% with no end date plus 0.5% ending) drops to 1%; **Santa Rosa** 1% (0.5% ending 12/31/2028 plus 0.5% ending 12/31/2026) drops to 0.5%. That holds unless voters extend them; the new form decides.

Do this in early January. Until it is done, the site may charge the wrong county tax.

## Ask an accountant

The site applies Florida sales tax the way a developer assumed was right. **Ask an accountant (or the Florida Department of Revenue) to confirm** before you rely on it:

- Tax is added only to orders shipped to a Florida address. Orders to other states are not taxed. This assumes you are below other states' remote-seller thresholds.
- The rate is the 6% state rate plus the surtax of the destination county. The surtax applies only to the first $5,000 of one item. Where a ZIP code spans counties, the higher rate is used.
- Shipping is taxed along with the painting.
- The monthly tax report is a helper for filing, not a filed return.

## If something goes wrong

- **Studio login always fails**: `STUDIO_PASSWORD` or `SESSION_SECRET` is missing, or `SESSION_SECRET` is under 32 characters. Fix it and redeploy. Many wrong passwords in a row also lock you out for a while.
- **Site errors after you changed a setting**: redeploy.
- **Payment buttons don't appear on painting pages**: `NEXT_PUBLIC_PAYPAL_CLIENT_ID` is missing.
- **Emails don't arrive**: the Resend domain isn't verified yet, or `EMAIL_FROM` doesn't use mbrownart.com.
