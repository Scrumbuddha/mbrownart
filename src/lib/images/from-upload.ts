import { del } from "@vercel/blob";
import { UploadError } from "./process";
import { isBlobUploadUrl, MAX_UPLOAD_BYTES } from "./upload-policy";

const FETCH_TIMEOUT_MS = 30_000;
const DIDNT_UPLOAD = "The photo didn't upload. Please try again.";

/**
 * Fetches a photo the browser uploaded straight to Blob, hands its bytes to `fn`, then deletes
 * the raw upload whatever happens. The URL is checked first, so the server only ever fetches a
 * public Vercel Blob https URL.
 */
export async function withUploadedPhoto<T>(url: string, fn: (photo: Buffer) => Promise<T>): Promise<T> {
  if (!isBlobUploadUrl(url)) throw new UploadError(DIDNT_UPLOAD);
  try {
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Uploaded photo fetch failed (${res.status})`);
    if (Number(res.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES) throw new UploadError(DIDNT_UPLOAD);
    const photo = Buffer.from(await res.arrayBuffer());
    if (photo.length > MAX_UPLOAD_BYTES) throw new UploadError(DIDNT_UPLOAD);
    return await fn(photo);
  } finally {
    await discardUpload(url);
  }
}

/** Best-effort delete of a raw upload (e.g. when the form had errors). Never throws. */
export async function discardUpload(url: unknown): Promise<void> {
  if (!isBlobUploadUrl(url)) return;
  try {
    await del(url);
  } catch (e) {
    console.error("Deleting a raw upload failed", e instanceof Error ? e.name : "unknown error");
  }
}
