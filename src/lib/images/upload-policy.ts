/**
 * Rules for photos the Studio uploads straight from the browser to Vercel Blob. Photos never pass
 * through a Vercel Function body, which is capped at 4.5 MB on every plan.
 */

/** The friendly limit the Studio forms check before uploading. */
export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const TOO_BIG = "That photo is too big. Please choose one under 20 MB.";

/** The hard limit written into the upload token (a little above the friendly one). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];

/** Raw uploads land here; the server action deletes each one after processing it. */
export const UPLOAD_PREFIX = "uploads/";
export const UPLOAD_ROUTE = "/api/studio/upload";

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/**
 * True only for an https URL on a public Vercel Blob host. The server fetches this URL, so
 * anything else (another host, http, a port, credentials) would be an SSRF hole.
 */
export function isBlobUploadUrl(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "https:"
    && url.port === ""
    && url.username === "" && url.password === ""
    && url.hostname.endsWith(BLOB_HOST_SUFFIX)
    && url.hostname.length > BLOB_HOST_SUFFIX.length;
}

/**
 * The handleUpload onBeforeGenerateToken step: only a signed-in Studio session may upload,
 * only images, only under UPLOAD_PREFIX, and at most MAX_UPLOAD_BYTES.
 */
export async function authorizeUpload(isStudio: () => Promise<boolean>, pathname: string) {
  if (!(await isStudio())) throw new Error("Not signed in to the Studio");
  if (!pathname.startsWith(UPLOAD_PREFIX) || pathname.includes("..")) throw new Error("Invalid upload path");
  return {
    allowedContentTypes: ALLOWED_UPLOAD_TYPES,
    maximumSizeInBytes: MAX_UPLOAD_BYTES,
    addRandomSuffix: true,
  };
}
