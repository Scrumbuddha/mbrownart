"use server";

import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStudio } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { discardUpload, withUploadedPhoto } from "@/lib/images/from-upload";
import { UploadError, processUpload } from "@/lib/images/process";
import { isBlobUploadUrl } from "@/lib/images/upload-policy";
import {
  JUST_SOLD, createPainting, loadedStatusOf, movePainting, setOrder, updatePainting,
  validatePaintingInput, type ProcessedImage,
} from "@/lib/paintings/admin";

export type SaveState = { errors?: Record<string, string>; message?: string; values?: Record<string, string> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidateSite(slugs: string[] = []) {
  revalidatePath("/");
  revalidatePath("/prints");
  revalidatePath("/studio");
  for (const slug of slugs) revalidatePath(`/paintings/${slug}`);
}

// React clears the form after an action, so send the typed text back to refill it.
function echo(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string" && k !== "id" && k !== "photoUrl" && k !== "loadedStatus") out[k] = v;
  return out;
}

/** Processes the photo the browser uploaded to Blob into the stored versions; the raw upload is deleted. */
async function storePhoto(photo: Buffer): Promise<ProcessedImage> {
  const { web, large, width, height } = await processUpload(photo);
  const opts = { access: "public", addRandomSuffix: true, contentType: "image/jpeg" } as const;
  const [w, l] = await Promise.all([
    put("paintings/web.jpg", web, opts),
    put("paintings/large.jpg", large, opts),
  ]);
  return { imageUrl: w.url, imageLargeUrl: l.url, imageWidth: width, imageHeight: height };
}

export async function savePainting(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requireStudio();
  const id = String(formData.get("id") ?? "");
  if (id && !UUID.test(id)) return { message: "That painting no longer exists." };
  const parsed = validatePaintingInput(formData);
  // The browser uploads the photo straight to Blob (see upload-photo.ts) and sends its URL.
  const photoUrl = formData.get("photoUrl");
  const hasPhoto = typeof photoUrl === "string" && photoUrl !== "";

  const errors: Record<string, string> = parsed.ok ? {} : { ...parsed.errors };
  if (!id && !hasPhoto) errors.photo = "Please choose a photo of the painting.";
  if (hasPhoto && !isBlobUploadUrl(photoUrl)) errors.photo = "The photo didn't upload. Please try again.";
  if (!parsed.ok || Object.keys(errors).length > 0) {
    await discardUpload(photoUrl);
    return { errors, values: echo(formData) };
  }

  let image: ProcessedImage | undefined;
  if (hasPhoto) {
    try {
      image = await withUploadedPhoto(photoUrl, storePhoto);
    } catch (e) {
      if (e instanceof UploadError) return { errors: { photo: e.message }, values: echo(formData) };
      console.error("Photo upload failed", e instanceof Error ? e.message : "unknown error");
      return { message: "The photo didn't upload. Please try again.", values: echo(formData) };
    }
  }

  const db = getDb();
  if (id) {
    const saved = await updatePainting(db, id, parsed.value, { image, loadedStatus: loadedStatusOf(formData) });
    if (!saved.ok) {
      return saved.error === "just_sold"
        ? { message: JUST_SOLD, values: echo(formData) }
        : { message: "That painting no longer exists." };
    }
    revalidateSite([saved.painting.slug]);
  } else {
    if (!image) return { errors: { photo: "Please choose a photo of the painting." } };
    const created = await createPainting(db, parsed.value, image);
    revalidateSite([created.slug]);
  }
  redirect("/studio");
}

export async function moveAction(formData: FormData): Promise<void> {
  await requireStudio();
  const direction = formData.get("direction") === "up" ? "up" : "down";
  const id = String(formData.get("id") ?? "");
  if (!UUID.test(id)) return;
  await movePainting(getDb(), id, direction);
  revalidateSite();
}

export async function reorderAction(ids: string[]): Promise<void> {
  await requireStudio();
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string" || !UUID.test(i))) return;
  await setOrder(getDb(), ids);
  revalidateSite();
}
