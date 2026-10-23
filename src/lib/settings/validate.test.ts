import { describe, expect, it } from "vitest";
import { createTestDb } from "../db/test-db";
import { getSettings, updateSettings } from "../db/settings";
import { validateSettingsInput } from "./validate";

const form = (o: Record<string, string>) => new Map(Object.entries(o)) as unknown as FormData;
const base = { artistName: "M Brown", shipping: "10" };

describe("validateSettingsInput", () => {
  it("converts the shipping fee to cents and reads the tax switch", () => {
    expect(validateSettingsInput(form({ ...base, shipping: "12.50", taxEnabled: "on" })))
      .toMatchObject({ ok: true, value: { shippingCents: 1250, taxEnabled: true, instagramUrl: null } });
    expect(validateSettingsInput(form(base))).toMatchObject({ ok: true, value: { taxEnabled: false } });
  });
  it("allows free shipping and exactly $1,000, rejects more, blank and junk", () => {
    expect(validateSettingsInput(form({ ...base, shipping: "0" }))).toMatchObject({ ok: true, value: { shippingCents: 0 } });
    expect(validateSettingsInput(form({ ...base, shipping: "1000" }))).toMatchObject({ ok: true, value: { shippingCents: 100000 } });
    for (const shipping of ["1000.01", "", "abc", "-5"]) {
      const r = validateSettingsInput(form({ ...base, shipping }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.errors.shipping).toBeTruthy();
    }
  });
  it("requires a name and sane email and Instagram link", () => {
    const r = validateSettingsInput(form({ ...base, artistName: " ", contactEmail: "nope", instagramUrl: "insta" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["artistName", "contactEmail", "instagramUrl"]);
  });
});

describe("updateSettings", () => {
  it("changes only the given fields", async () => {
    const db = await createTestDb();
    await updateSettings(db, { shippingCents: 0, aboutText: "Hi" });
    expect(await getSettings(db)).toMatchObject({ shippingCents: 0, aboutText: "Hi", artistName: "M Brown", taxEnabled: true });
  });
});
