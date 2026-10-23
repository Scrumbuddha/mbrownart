import type { Settings } from "../db/schema";
import { parsePrice } from "../paintings/admin";

type FormLike = { get(name: string): FormDataEntryValue | null };
export type SettingsPatch = Pick<
  Settings, "artistName" | "shippingCents" | "taxEnabled" | "aboutText" | "contactEmail" | "instagramUrl"
>;
export type SettingsResult =
  | { ok: true; value: SettingsPatch }
  | { ok: false; errors: Record<string, string> };

const MAX_SHIPPING_CENTS = 100_000; // $1,000
const SHIPPING_FORMAT = "Enter the shipping fee in dollars, like 10 or 7.50.";
const SHIPPING_TOO_HIGH = "Please enter a shipping fee of $1,000 or less.";
const text = (raw: FormLike, name: string) => String(raw.get(name) ?? "").trim();

export function validateSettingsInput(raw: FormLike): SettingsResult {
  const errors: Record<string, string> = {};

  const artistName = text(raw, "artistName");
  if (!artistName) errors.artistName = "Please enter your name.";

  const fee = parsePrice(text(raw, "shipping"));
  let shippingCents = 0;
  if ("error" in fee) errors.shipping = fee.error.includes("under") ? SHIPPING_TOO_HIGH : SHIPPING_FORMAT;
  else if (fee.cents == null) errors.shipping = SHIPPING_FORMAT;
  else if (fee.cents > MAX_SHIPPING_CENTS) errors.shipping = SHIPPING_TOO_HIGH;
  else shippingCents = fee.cents;

  const contactEmail = text(raw, "contactEmail");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    errors.contactEmail = "Please enter your email address, like name@example.com.";
  }

  const instagram = text(raw, "instagramUrl");
  if (instagram && !/^https?:\/\/\S+$/i.test(instagram)) {
    errors.instagramUrl = "Paste the full link, starting with https://";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      artistName,
      shippingCents,
      taxEnabled: ["on", "true"].includes(text(raw, "taxEnabled")),
      aboutText: text(raw, "aboutText"),
      contactEmail,
      instagramUrl: instagram || null,
    },
  };
}
