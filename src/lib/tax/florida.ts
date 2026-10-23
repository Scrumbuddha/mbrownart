import zipCounty from "./fl-zip-county.json";
import { FL_SURTAX } from "./fl-surtax";

const ZIP_COUNTY = zipCounty as Record<string, string[]>;
const STATE_RATE = 0.06;
const SURTAX_CAP_CENTS = 500000; // surtax applies to first $5,000 of an item

export function computeTax(input: {
  state: string;
  zip: string;
  itemCents: number;
  shippingCents: number;
  enabled: boolean;
}): { taxCents: number; county: string | null } {
  if (!input.enabled || input.state !== "FL") return { taxCents: 0, county: null };

  const counties = ZIP_COUNTY[input.zip.slice(0, 5)] ?? [];
  let county: string | null = null;
  for (const c of counties) {
    if (county === null || (FL_SURTAX[c] ?? 0) > (FL_SURTAX[county] ?? 0)) county = c;
  }

  const base = input.itemCents + input.shippingCents;
  const state = Math.round(STATE_RATE * base);
  const surtax = county
    ? Math.round((FL_SURTAX[county] ?? 0) * Math.min(base, SURTAX_CAP_CENTS))
    : 0;
  return { taxCents: state + surtax, county };
}
