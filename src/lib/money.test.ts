import { describe, expect, it } from "vitest";
import { formatCents } from "./money";

describe("formatCents", () => {
  it("omits cents when zero", () => {
    expect(formatCents(42000)).toBe("$420");
    expect(formatCents(0)).toBe("$0");
  });
  it("shows cents otherwise", () => {
    expect(formatCents(4550)).toBe("$45.50");
  });
});
