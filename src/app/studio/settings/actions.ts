"use server";

import { put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { requireStudio } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { updateSettings } from "@/lib/db/settings";
import { discardUpload, withUploadedPhoto } from "@/lib/images/from-upload";
import { UploadError, processUpload } from "@/lib/images/process";
import { isBlobUploadUrl } from "@/lib/images/upload-policy";
import { validateSettingsInput } from "@/lib/settings/validate";

export type SettingsState = { errors?: Record<string, string>; message?: string; saved?: boolean; values?: Record<string, string> };

function echo(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of formData.entries()) if (typeof v === "string" && k !== "aboutPhotoUrl") out[k] = v;
  return out;
}

export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireStudio();
  const parsed = validateSettingsInput(formData);
  // The browser uploads the photo straight to Blob (see upload-photo.ts) and sends its URL.
  const uploaded = formData.get("aboutPhotoUrl");
  const hasPhoto = typeof uploaded === "string" && uploaded !== "";

  const errors: Record<string, string> = parsed.ok ? {} : { ...parsed.errors };
  if (hasPhoto && !isBlobUploadUrl(uploaded)) errors.aboutPhoto = "The photo didn't upload. Please try again.";
  if (!parsed.ok || Object.keys(errors).length > 0) {
    await discardUpload(uploaded);
    return { errors, values: echo(formData) };
  }

  let aboutPhotoUrl: string | undefined;
  if (hasPhoto) {
    try {
      aboutPhotoUrl = await withUploadedPhoto(uploaded, async (photo) => {
        const { web } = await processUpload(photo);
        const blob = await put("about/photo.jpg", web, { access: "public", addRandomSuffix: true, contentType: "image/jpeg" });
        return blob.url;
      });
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
