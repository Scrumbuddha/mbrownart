import { afterEach, describe, expect, it, vi } from "vitest";

const { del } = vi.hoisted(() => ({ del: vi.fn(async () => {}) }));
vi.mock("@vercel/blob", () => ({ del }));

import { discardUpload, withUploadedPhoto } from "./from-upload";
import { UploadError } from "./process";

const URL_OK = "https://abc.public.blob.vercel-storage.com/uploads/p-x1.jpg";

afterEach(() => {
  vi.unstubAllGlobals();
  del.mockClear();
});

describe("withUploadedPhoto", () => {
  it("never fetches or deletes a URL that is not a public Vercel Blob https URL", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const fn = vi.fn();
    await expect(withUploadedPhoto("https://169.254.169.254/x", fn)).rejects.toBeInstanceOf(UploadError);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(fn).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("fetches the upload without following redirects, hands over the bytes, then deletes it", async () => {
    const fetchSpy = vi.fn(async () => new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal("fetch", fetchSpy);
    const result = await withUploadedPhoto(URL_OK, async (buf) => buf.length);
    expect(result).toBe(3);
    expect(fetchSpy).toHaveBeenCalledWith(URL_OK, expect.objectContaining({ redirect: "error" }));
    expect(del).toHaveBeenCalledWith(URL_OK);
  });

  it("still deletes the raw upload when processing fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    await expect(withUploadedPhoto(URL_OK, async () => { throw new UploadError("bad photo"); })).rejects.toThrow("bad photo");
    expect(del).toHaveBeenCalledWith(URL_OK);
  });

  it("refuses an upload over 25 MB", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response("x", { headers: { "content-length": String(26 * 1024 * 1024) } })));
    const fn = vi.fn();
    await expect(withUploadedPhoto(URL_OK, fn)).rejects.toBeInstanceOf(UploadError);
    expect(fn).not.toHaveBeenCalled();
    expect(del).toHaveBeenCalledWith(URL_OK);
  });

  it("fails on a non-2xx fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 404 })));
    await expect(withUploadedPhoto(URL_OK, vi.fn())).rejects.toThrow(/fetch/);
  });
});

describe("discardUpload", () => {
  it("deletes a valid upload URL and ignores anything else", async () => {
    await discardUpload(URL_OK);
    await discardUpload("https://evil.com/x");
    expect(del).toHaveBeenCalledTimes(1);
  });

  it("never throws, even if the delete fails", async () => {
    del.mockRejectedValueOnce(new Error("down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(discardUpload(URL_OK)).resolves.toBeUndefined();
  });
});
