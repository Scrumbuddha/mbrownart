// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Painting } from "@/lib/db/schema";
import { GalleryGrid } from "./GalleryGrid";

afterEach(cleanup);

function painting(over: Partial<Painting>): Painting {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    slug: "harbor-light",
    title: "Harbor Light",
    medium: "Watercolor on cotton paper",
    size: "11 × 14 in",
    year: 2026,
    description: "",
    imageUrl: "https://x.public.blob.vercel-storage.com/a.webp",
    imageLargeUrl: "https://x.public.blob.vercel-storage.com/a-large.webp",
    imageWidth: 800,
    imageHeight: 1000,
    originalStatus: "for_sale",
    originalPriceCents: 42000,
    printEnabled: false,
    printSize: null,
    printPriceCents: null,
    visible: true,
    sortOrder: 0,
    heldUntil: null,
    heldByOrderId: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...over,
  };
}

describe("GalleryGrid", () => {
  it("shows the title and price of a for-sale painting, linking to its page", () => {
    render(<GalleryGrid paintings={[painting({})]} />);
    const link = screen.getByRole("link", { name: /Harbor Light/ });
    expect(link.getAttribute("href")).toBe("/paintings/harbor-light");
    expect(within(link).getByText("$420")).toBeTruthy();
    expect(within(link).queryByText("Sold")).toBeNull();
  });

  it("shows Sold and the print price for a sold painting with prints", () => {
    const sold = painting({
      id: "00000000-0000-0000-0000-000000000002",
      slug: "spring-field",
      title: "Spring Field",
      originalStatus: "sold",
      printEnabled: true,
      printSize: "8 × 10 in",
      printPriceCents: 4500,
    });
    render(<GalleryGrid paintings={[painting({}), sold]} />);
    const link = screen.getByRole("link", { name: /Spring Field/ });
    expect(link.getAttribute("href")).toBe("/paintings/spring-field");
    expect(within(link).getByText("Sold")).toBeTruthy();
    expect(within(link).getByText("prints $45")).toBeTruthy();
  });

  it("shows just Sold when a sold painting has no prints", () => {
    render(<GalleryGrid paintings={[painting({ originalStatus: "sold" })]} />);
    const link = screen.getByRole("link", { name: /Harbor Light/ });
    expect(within(link).getByText("Sold")).toBeTruthy();
    expect(link.textContent).toBe("Harbor Light · Sold");
  });

  it("renders each image at its stored size, uncropped", () => {
    render(<GalleryGrid paintings={[painting({})]} />);
    const img = screen.getByRole("img", { name: "Harbor Light" });
    expect(img.getAttribute("width")).toBe("800");
    expect(img.getAttribute("height")).toBe("1000");
  });
});
