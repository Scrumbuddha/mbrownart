import { describe, expect, it } from "vitest";
import { computeTax } from "./florida";
import { FL_SURTAX } from "./fl-surtax";
import zipCounty from "./fl-zip-county.json";

const base = { state: "FL", zip: "33701", itemCents: 42000, shippingCents: 1000, enabled: true };

describe("computeTax", () => {
  it("charges 7% in Pinellas", () => {
    expect(computeTax(base)).toEqual({ taxCents: 3010, county: "Pinellas" });
  });
  it("is zero outside FL", () => {
    expect(computeTax({ ...base, state: "GA" })).toEqual({ taxCents: 0, county: null });
  });
  it("is zero when disabled", () => {
    expect(computeTax({ ...base, enabled: false }).taxCents).toBe(0);
  });
  it("caps the surtax at the first $5,000", () => {
    const r = computeTax({ ...base, itemCents: 800000 });
    expect(r.taxCents).toBe(Math.round(0.06 * 801000) + Math.round(0.01 * 500000));
  });
  it("charges state 6% only for an unknown FL ZIP", () => {
    expect(computeTax({ ...base, zip: "00000" })).toEqual({ taxCents: 2580, county: null });
  });
  it("has a surtax entry for every county in the ZIP map", () => {
    const names = new Set(Object.values(zipCounty as Record<string, string[]>).flat());
    expect(names.size).toBe(67);
    for (const n of names) expect(FL_SURTAX).toHaveProperty(n);
  });
  it("picks the highest-rate county for a ZIP spanning counties", () => {
    const multi = Object.entries(zipCounty as Record<string, string[]>).find(
      ([, c]) => c.length > 1 && new Set(c.map((n) => FL_SURTAX[n])).size > 1,
    );
    expect(multi).toBeDefined();
    const [zip, cs] = multi!;
    const top = cs.reduce((a, b) => (FL_SURTAX[b] > FL_SURTAX[a] ? b : a));
    expect(computeTax({ ...base, zip }).county).toBe(top);
  });
});
