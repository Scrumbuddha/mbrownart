import { describe, expect, it } from "vitest";
import { ALLOWED_UPLOAD_TYPES, authorizeUpload, isBlobUploadUrl, MAX_UPLOAD_BYTES } from "./upload-policy";

describe("isBlobUploadUrl", () => {
  it("accepts an https URL on a public Vercel Blob host", () => {
    expect(isBlobUploadUrl("https://abc123.public.blob.vercel-storage.com/uploads/photo-x1y2.jpg")).toBe(true);
  });

  it("rejects anything the server should not fetch", () => {
    for (const url of [
      "http://abc123.public.blob.vercel-storage.com/uploads/p.jpg", // not https
      "https://evil.com/uploads/p.jpg",
      "https://abc123.public.blob.vercel-storage.com.evil.com/p.jpg", // suffix trick
      "https://evilpublic.blob.vercel-storage.com/p.jpg", // not a subdomain of the suffix
      "https://.public.blob.vercel-storage.com/p.jpg",
      "https://public.blob.vercel-storage.com/p.jpg",
      "https://abc.public.blob.vercel-storage.com:8443/p.jpg", // explicit port
      "https://user:pw@abc.public.blob.vercel-storage.com/p.jpg", // credentials
      "https://169.254.169.254/latest/meta-data",
      "file:///etc/passwd",
      "not a url",
      "",
      `https://abc.public.blob.vercel-storage.com/${"a".repeat(2100)}`,
    ]) {
      expect(isBlobUploadUrl(url), url).toBe(false);
    }
    expect(isBlobUploadUrl(null)).toBe(false);
    expect(isBlobUploadUrl(42)).toBe(false);
  });
});

describe("authorizeUpload", () => {
  it("refuses a request without a Studio session", async () => {
    await expect(authorizeUpload(async () => false, "uploads/p.jpg")).rejects.toThrow(/Studio/);
  });

  it("refuses paths outside uploads/", async () => {
    await expect(authorizeUpload(async () => true, "paintings/web.jpg")).rejects.toThrow(/path/);
    await expect(authorizeUpload(async () => true, "uploads/../paintings/web.jpg")).rejects.toThrow(/path/);
  });

  it("allows only phone and web image types, up to 25 MB, with a random suffix", async () => {
    expect(await authorizeUpload(async () => true, "uploads/p.jpg")).toEqual({
      allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
      maximumSizeInBytes: 25 * 1024 * 1024,
      addRandomSuffix: true,
    });
    expect(ALLOWED_UPLOAD_TYPES).not.toContain("image/svg+xml");
    expect(MAX_UPLOAD_BYTES).toBe(26214400);
  });
});
