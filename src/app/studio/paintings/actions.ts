"use server";

import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStudio } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { UploadError, processUpload } from "@/lib/images/process";
import {
  createPainting, movePainting, setOrder, updatePainting,
  validatePaintingInput, type ProcessedImage,
} from "@/lib/paintings/admin";

export type SaveState = { errors?: Record<string, string>; message?: string; values?: Record<string, string> };

const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

function revalidateSite(slugs: string[] = []) {
  revalidatePath("/");
  revalidatePath("/prints");
  revalidatePath("/studio");
  for (const slug of slugs) revalidatePath(`/paintings/${slug}`);
}

// React clears the form after an action, so send the typed text back to refill it.
function echo(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string" && k !== "id") out[k] = v;
  return out;
}

async function uploadPhoto(file: File): Promise<ProcessedImage> {
  const { web, large, width, height } = await processUpload(Buffer.from(await file.arrayBuffer()));
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
  const parsed = validatePaintingInput(formData);
  const photo = formData.get("photo");
  const file = photo instanceof File && photo.size > 0 ? photo : null;

  const errors: Record<string, string> = parsed.ok ? {} : { ...parsed.errors };
  if (!id && !file) errors.photo = "Please choose a photo of the painting.";
  if (file && file.size > MAX_PHOTO_BYTES) errors.photo = "That photo is too big. Please choose one under 20 MB.";
  if (!parsed.ok || Object.keys(errors).length > 0) return { errors, values: echo(formData) };

  let image: ProcessedImage | undefined;
  if (file) {
    try {
      image = await uploadPhoto(file);
    } catch (e) {
      if (e instanceof UploadError) return { errors: { photo: e.message }, values: echo(formData) };
      console.error("Photo upload failed", e);
      return { message: "The photo didn't upload. Please try again.", values: echo(formData) };
    }
  }

  const db = getDb();
  if (id) {
    const saved = await updatePainting(db, id, parsed.value, image);
    if (!saved) return { message: "That painting no longer exists." };
    revalidateSite([saved.slug]);
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
  const db = getDb();
  await movePainting(db, String(formData.get("id") ?? ""), direction);
  revalidateSite();
}

export async function reorderAction(ids: string[]): Promise<void> {
  await requireStudio();
  if (!Array.isArray(ids) || ids.some((i) => typeof i !== "string")) return;
  await setOrder(getDb(), ids);
  revalidateSite();
}
