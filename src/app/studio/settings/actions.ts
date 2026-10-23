"use server";

import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { requireStudio } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { updateSettings } from "@/lib/db/settings";
import { UploadError, processUpload } from "@/lib/images/process";
import { validateSettingsInput } from "@/lib/settings/validate";

export type SettingsState = { errors?: Record<string, string>; message?: string; saved?: boolean; values?: Record<string, string> };

const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

function echo(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireStudio();
  const parsed = validateSettingsInput(formData);
  const photo = formData.get("aboutPhoto");
  const file = photo instanceof File && photo.size > 0 ? photo : null;

  const errors: Record<string, string> = parsed.ok ? {} : { ...parsed.errors };
  if (file && file.size > MAX_PHOTO_BYTES) errors.aboutPhoto = "That photo is too big. Please choose one under 20 MB.";
  if (!parsed.ok || Object.keys(errors).length > 0) return { errors, values: echo(formData) };

  let aboutPhotoUrl: string | undefined;
  if (file) {
    try {
      const { web } = await processUpload(Buffer.from(await file.arrayBuffer()));
      const blob = await put("about/photo.jpg", web, { access: "public", addRandomSuffix: true, contentType: "image/jpeg" });
      aboutPhotoUrl = blob.url;
    } catch (e) {
      if (e instanceof UploadError) return { errors: { aboutPhoto: e.message }, values: echo(formData) };
      console.error("About photo upload failed", e instanceof Error ? e.message : "unknown error");
      return { message: "The photo didn't upload. Please try again.", values: echo(formData) };
    }
  }

  await updateSettings(getDb(), { ...parsed.value, ...(aboutPhotoUrl ? { aboutPhotoUrl } : {}) });
  revalidatePath("/", "layout");
  return { saved: true };
}
