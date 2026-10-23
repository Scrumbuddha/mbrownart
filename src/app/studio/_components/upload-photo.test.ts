import { afterEach, describe, expect, it, vi } from "vitest";

const { upload } = vi.hoisted(() => ({
  upload: vi.fn(async () => ({ url: "https://abc.public.blob.vercel-storage.com/uploads/photo-x1.jpg" })),
}));
vi.mock("@vercel/blob/client", () => ({ upload }));

import { uploadChosenPhoto } from "./upload-photo";

const fileOf = (bytes: number, name = "IMG_1.JPG", type = "image/jpeg") =>
  new File([new Uint8Array(bytes)], name, { type });

afterEach(() => upload.mockClear());

describe("uploadChosenPhoto", () => {
  it("uploads straight to Blob and swaps the file for its URL", async () => {
    const fd = new FormData();
    fd.set("photo", fileOf(10));
    fd.set("title", "Harbor");
    expect(await uploadChosenPhoto(fd, "photo")).toBeNull();
    expect(upload).toHaveBeenCalledWith("uploads/photo.jpg", expect.any(File), expect.objectContaining({
      access: "public", handleUploadUrl: "/api/studio/upload", contentType: "image/jpeg", multipart: false,
    }));
    expect(fd.get("photo")).toBeNull();
    expect(fd.get("photoUrl")).toBe("https://abc.public.blob.vercel-storage.com/uploads/photo-x1.jpg");
    expect(fd.get("title")).toBe("Harbor");
  });

  it("does nothing when no photo was chosen", async () => {
    const fd = new FormData();
    fd.set("photo", new File([], "", { type: "application/octet-stream" }));
    expect(await uploadChosenPhoto(fd, "photo")).toBeNull();
    expect(upload).not.toHaveBeenCalled();
    expect(fd.has("photo")).toBe(false);
  });

  it("keeps the friendly 20 MB check before uploading", async () => {
    const fd = new FormData();
    fd.set("photo", fileOf(20 * 1024 * 1024 + 1));
    expect(await uploadChosenPhoto(fd, "photo")).toBe("That photo is too big. Please choose one under 20 MB.");
    expect(upload).not.toHaveBeenCalled();
  });

  it("refuses non-photo types and reports a failed upload", async () => {
    const gif = new FormData();
    gif.set("photo", fileOf(10, "a.gif", "image/gif"));
    expect(await uploadChosenPhoto(gif, "photo")).toMatch(/JPEG, PNG, WebP or HEIC/);

    upload.mockRejectedValueOnce(new Error("network"));
    const fd = new FormData();
    fd.set("aboutPhoto", fileOf(10, "me.png", "image/png"));
    expect(await uploadChosenPhoto(fd, "aboutPhoto")).toBe("The photo didn't upload. Please try again.");
    expect(fd.has("aboutPhotoUrl")).toBe(false);
  });

  it("uses multipart for big phone photos", async () => {
    const fd = new FormData();
    fd.set("photo", fileOf(9 * 1024 * 1024, "big.heic", "image/heic"));
    await uploadChosenPhoto(fd, "photo");
    expect(upload).toHaveBeenCalledWith("uploads/photo.heic", expect.any(File), expect.objectContaining({ multipart: true }));
  });
});
