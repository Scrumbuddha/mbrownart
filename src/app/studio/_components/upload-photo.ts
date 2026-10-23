import { upload } from "@vercel/blob/client";
import {
  ALLOWED_UPLOAD_TYPES, MAX_PHOTO_BYTES, TOO_BIG, UPLOAD_PREFIX, UPLOAD_ROUTE,
} from "@/lib/images/upload-policy";

const DIDNT_UPLOAD = "The photo didn't upload. Please try again.";
const WRONG_TYPE = "Please choose a JPEG, PNG, WebP or HEIC photo.";
/** Above this, Blob splits the upload into parts and retries failed ones (better on phone data). */
const MULTIPART_FROM_BYTES = 8 * 1024 * 1024;

/**
 * Takes the file in `field` out of `fd`, uploads it from the browser straight to Blob, and puts
 * its URL in `${field}Url` instead, so the server action never receives the photo itself.
 * Returns an error message for the field, or null (also when no file was chosen).
 */
export async function uploadChosenPhoto(fd: FormData, field: string): Promise<string | null> {
  const file = fd.get(field);
  fd.delete(field);
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_PHOTO_BYTES) return TOO_BIG;
  if (file.type && !ALLOWED_UPLOAD_TYPES.includes(file.type)) return WRONG_TYPE;
  const ext = /\.([a-z0-9]{1,5})$/i.exec(file.name)?.[1]?.toLowerCase() ?? "jpg";
  try {
    const blob = await upload(`${UPLOAD_PREFIX}photo.${ext}`, file, {
      access: "public",
      handleUploadUrl: UPLOAD_ROUTE,
      ...(file.type ? { contentType: file.type } : {}),
      multipart: file.size > MULTIPART_FROM_BYTES,
    });
    fd.set(`${field}Url`, blob.url);
    return null;
  } catch {
    return DIDNT_UPLOAD;
  }
}
