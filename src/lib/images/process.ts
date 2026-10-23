import sharp from "sharp";

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

const WEB_EDGE = 1200;
const LARGE_EDGE = 2400;

async function resize(file: Buffer, edge: number) {
  // .rotate() with no arguments applies the EXIF orientation; output carries no metadata.
  return sharp(file)
    .rotate()
    .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer({ resolveWithObject: true });
}

export async function processUpload(
  file: Buffer,
): Promise<{ web: Buffer; large: Buffer; width: number; height: number }> {
  try {
    const web = await resize(file, WEB_EDGE);
    const large = await resize(file, LARGE_EDGE);
    return {
      web: web.data,
      large: large.data,
      width: web.info.width,
      height: web.info.height,
    };
  } catch {
    throw new UploadError(
      "We couldn't read that photo. Try saving it as a JPEG and uploading again.",
    );
  }
}
