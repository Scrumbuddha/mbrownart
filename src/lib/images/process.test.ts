import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { UploadError, processUpload } from "./process";

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

describe("processUpload", () => {
  it("rotates by EXIF orientation and strips metadata", async () => {
    const out = await processUpload(fixture("orientation-6.jpg"));
    expect(out.height).toBeGreaterThan(out.width);
    expect(out.width).toBe(200);
    expect(out.height).toBe(400);
    const meta = await sharp(out.web).metadata();
    expect(meta.format).toBe("jpeg");
    expect(meta.height).toBeGreaterThan(meta.width!);
    expect(meta.exif).toBeUndefined();
  });

  it("limits the long edge to 1200 (web) and 2400 (large) without enlarging", async () => {
    const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: "#468" } }).jpeg().toBuffer();
    const out = await processUpload(big);
    expect((await sharp(out.web).metadata()).width).toBe(1200);
    expect((await sharp(out.large).metadata()).width).toBe(2400);
    expect(out.width).toBe(1200);
    expect(out.height).toBe(800);
    const small = await processUpload(fixture("orientation-6.jpg"));
    expect((await sharp(small.large).metadata()).height).toBe(400);
  });

  it("rejects a file it cannot decode with a friendly UploadError", async () => {
    const err = await processUpload(fixture("garbage.heic")).catch((e) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect(err.message).toBe("We couldn't read that photo. Try saving it as a JPEG and uploading again.");
  });
});
