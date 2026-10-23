"use client";

import { useActionState, useState, useTransition, type FormEvent } from "react";
import { MAX_PHOTO_BYTES, TOO_BIG } from "@/lib/images/upload-policy";
import { savePainting, type SaveState } from "../paintings/actions";
import { uploadChosenPhoto } from "./upload-photo";

export type FormPainting = {
  id: string;
  title: string;
  medium: string;
  size: string;
  year: number;
  description: string;
  imageUrl: string;
  originalStatus: "for_sale" | "sold" | "not_for_sale";
  originalPriceCents: number | null;
  printEnabled: boolean;
  printSize: string | null;
  printPriceCents: number | null;
  visible: boolean;
};

const dollars = (cents: number | null) =>
  cents == null ? "" : (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

const input = {
  width: "100%", padding: "10px 12px", fontSize: 16, border: "1px solid #ccc",
  borderRadius: 4, fontFamily: "inherit", background: "#fff", color: "#222",
} as const;
const label = { display: "block", fontSize: 14, margin: "0 0 6px", color: "#333" } as const;
const field = { marginBottom: 20 } as const;
const errorStyle = { color: "#b04a3a", fontSize: 14, margin: "6px 0 0" } as const;
const button = {
  padding: "12px 16px", fontSize: 16, fontWeight: 500, borderRadius: 4,
  fontFamily: "inherit", cursor: "pointer", flex: "1 1 160px",
} as const;

export function PaintingForm({ painting }: { painting?: FormPainting }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(savePainting, {});
  const [status, setStatus] = useState(
    (state.values?.originalStatus as FormPainting["originalStatus"] | undefined) ?? painting?.originalStatus ?? "for_sale",
  );
  const [printOn, setPrintOn] = useState(painting?.printEnabled ?? false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [, startTransition] = useTransition();
  const busy = pending || uploading;

  // Upload the photo from the browser straight to Blob first, then send the form with its URL.
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    setUploading(true);
    const problem = await uploadChosenPhoto(fd, "photo");
    setUploading(false);
    if (problem) return setPhotoError(problem);
    startTransition(() => action(fd));
  };
  const errors: Record<string, string> = { ...(state.errors ?? {}), ...(photoError ? { photo: photoError } : {}) };
  const v = (name: string, fallback: string | number | null | undefined) =>
    state.values?.[name] ?? (fallback == null ? "" : String(fallback));

  const err = (name: string) =>
    errors[name] ? <p id={`${name}-error`} role="alert" style={errorStyle}>{errors[name]}</p> : null;
  const invalid = (name: string) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  return (
    <form onSubmit={onSubmit}>
      {painting && <input type="hidden" name="id" value={painting.id} />}

      <div style={field}>
        <label htmlFor="photo" style={label}>
          {painting ? "Replace the photo (optional)" : "Photo of the painting"}
        </label>
        {painting && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={painting.imageUrl} alt="" style={{ display: "block", maxWidth: 160, maxHeight: 160, marginBottom: 10 }} />
        )}
        <input id="photo" name="photo" type="file" accept="image/*"
          onChange={(e) => setPhotoError((e.target.files?.[0]?.size ?? 0) > MAX_PHOTO_BYTES ? TOO_BIG : null)} style={{ fontSize: 16, maxWidth: "100%" }} {...invalid("photo")} />
        {err("photo")}
      </div>

      <div style={field}>
        <label htmlFor="title" style={label}>Title</label>
        <input id="title" name="title" defaultValue={v("title", painting?.title)} style={input} {...invalid("title")} />
        {err("title")}
      </div>

      <div style={field}>
        <label htmlFor="medium" style={label}>Paint and paper</label>
        <input id="medium" name="medium" defaultValue={v("medium", painting?.medium ?? "Watercolor on paper")} style={input} />
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", ...field }}>
        <div style={{ flex: "1 1 160px" }}>
          <label htmlFor="size" style={label}>Size (for example 11 x 14 in)</label>
          <input id="size" name="size" defaultValue={v("size", painting?.size)} style={input} />
        </div>
        <div style={{ flex: "1 1 120px" }}>
          <label htmlFor="year" style={label}>Year painted</label>
          <input id="year" name="year" inputMode="numeric" defaultValue={v("year", painting?.year ?? new Date().getFullYear())} style={input} {...invalid("year")} />
          {err("year")}
        </div>
      </div>

      <div style={field}>
        <label htmlFor="description" style={label}>About this painting</label>
        <textarea id="description" name="description" rows={4} defaultValue={v("description", painting?.description)} style={input} />
      </div>

      <fieldset style={{ border: 0, padding: 0, margin: "0 0 20px" }}>
        <legend style={{ ...label, padding: 0 }}>The original painting</legend>
        {([["for_sale", "For sale"], ["sold", "Sold"], ["not_for_sale", "Not for sale"]] as const).map(([value, text]) => (
          <label key={value} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", fontSize: 16 }}>
            <input
              type="radio" name="originalStatus" value={value}
              checked={status === value} onChange={() => setStatus(value)}
              style={{ width: 20, height: 20 }}
            />
            {text}
          </label>
        ))}
      </fieldset>

      <div style={field}>
        <label htmlFor="originalPrice" style={label}>Price of the original ($)</label>
        <input
          id="originalPrice" name="originalPrice" inputMode="decimal"
          defaultValue={v("originalPrice", dollars(painting?.originalPriceCents ?? null))} style={input}
          {...invalid("originalPriceCents")}
        />
        {err("originalPriceCents")}
      </div>

      <div style={field}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16 }}>
          <input
            type="checkbox" name="printEnabled" checked={printOn}
            onChange={(e) => setPrintOn(e.target.checked)} style={{ width: 20, height: 20 }}
          />
          Also sell prints of this painting
        </label>
      </div>

      {printOn && (
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", ...field }}>
          <div style={{ flex: "1 1 160px" }}>
            <label htmlFor="printSize" style={label}>Print size (for example 8 x 10 in)</label>
            <input id="printSize" name="printSize" defaultValue={v("printSize", painting?.printSize)} style={input} {...invalid("printSize")} />
            {err("printSize")}
          </div>
          <div style={{ flex: "1 1 120px" }}>
            <label htmlFor="printPrice" style={label}>Price of a print ($)</label>
            <input
              id="printPrice" name="printPrice" inputMode="decimal"
              defaultValue={v("printPrice", dollars(painting?.printPriceCents ?? null))} style={input}
              {...invalid("printPriceCents")}
            />
            {err("printPriceCents")}
          </div>
        </div>
      )}

      {state.errors && !photoError && (
        <p style={{ color: "#777", fontSize: 14, margin: "0 0 12px" }}>
          Please choose the photo again before you save, as the form cannot keep it.
        </p>
      )}
      {state.message && <p role="alert" style={errorStyle}>{state.message}</p>}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
        <button type="submit" name="visible" value="true" disabled={busy || !!photoError}
          style={{ ...button, background: "#222", color: "#fff", border: 0 }}>
          {uploading ? "Uploading photo..." : pending ? "Saving..." : "Publish"}
        </button>
        <button type="submit" name="visible" value="false" disabled={busy || !!photoError}
          style={{ ...button, background: "#fff", color: "#222", border: "1px solid #999" }}>
          Save as hidden
        </button>
      </div>
      {painting && (
        <p style={{ color: "#777", fontSize: 14 }}>
          This painting is currently {painting.visible ? "showing on the site" : "hidden from the site"}.
        </p>
      )}
    </form>
  );
}
