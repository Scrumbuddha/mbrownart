import { describe, expect, it } from "vitest";
import { galleryCaption } from "./caption";

describe("galleryCaption", () => {
  it("shows the original price when for sale", () => {
    expect(galleryCaption({ originalStatus: "for_sale", originalPriceCents: 42000, printEnabled: true, printPriceCents: 4500 }))
      .toEqual({ price: "$420", sold: false });
  });
  it("shows prints when the original is sold", () => {
    expect(galleryCaption({ originalStatus: "sold", originalPriceCents: 42000, printEnabled: true, printPriceCents: 4500 }))
      .toEqual({ price: "prints $45", sold: true });
  });
  it("shows only sold when sold with no print", () => {
    expect(galleryCaption({ originalStatus: "sold", originalPriceCents: 42000, printEnabled: false, printPriceCents: null }))
      .toEqual({ price: null, sold: true });
  });
  it("shows the print price when the original is not for sale", () => {
    expect(galleryCaption({ originalStatus: "not_for_sale", originalPriceCents: null, printEnabled: true, printPriceCents: 4500 }))
      .toEqual({ price: "Print $45", sold: false });
  });
  it("shows nothing when nothing is for sale", () => {
    expect(galleryCaption({ originalStatus: "not_for_sale", originalPriceCents: null, printEnabled: false, printPriceCents: null }))
      .toEqual({ price: null, sold: false });
  });
});
