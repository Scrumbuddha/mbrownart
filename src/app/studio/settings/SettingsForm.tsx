"use client";

import { useActionState } from "react";
import type { Settings } from "@/lib/db/schema";
import { saveSettings, type SettingsState } from "./actions";

const input = {
  width: "100%", padding: "10px 12px", fontSize: 16, border: "1px solid #ccc",
  borderRadius: 4, fontFamily: "inherit", background: "#fff", color: "#222",
} as const;
const label = { display: "block", fontSize: 14, margin: "0 0 6px", color: "#333" } as const;
const field = { marginBottom: 20 } as const;
const errorStyle = { color: "#b04a3a", fontSize: 14, margin: "6px 0 0" } as const;

const dollars = (cents: number) => (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(saveSettings, {});
  const errors = state.errors ?? {};
  const v = (name: string, fallback: string) => state.values?.[name] ?? fallback;
  const err = (name: string) => errors[name] ? <p id={`${name}-error`} role="alert" style={errorStyle}>{errors[name]}</p> : null;
  const invalid = (name: string) => ({
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });
  const taxOn = state.values ? state.values.taxEnabled === "on" : settings.taxEnabled;

  return (
    <form action={action}>
      <div style={field}>
        <label htmlFor="artistName" style={label}>Your name (shown at the top of the site)</label>
        <input id="artistName" name="artistName" defaultValue={v("artistName", settings.artistName)} style={input} {...invalid("artistName")} />
        {err("artistName")}
      </div>

      <div style={field}>
        <label htmlFor="shipping" style={label}>Shipping fee for every order ($)</label>
        <input id="shipping" name="shipping" inputMode="decimal" defaultValue={v("shipping", dollars(settings.shippingCents))} style={input} {...invalid("shipping")} />
        {err("shipping")}
      </div>

      <div style={field}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16 }}>
          <input type="checkbox" name="taxEnabled" defaultChecked={taxOn} style={{ width: 24, height: 24 }} />
          Collect Florida sales tax
        </label>
      </div>

      <div style={field}>
        <label htmlFor="aboutText" style={label}>About you</label>
        <textarea id="aboutText" name="aboutText" rows={6} defaultValue={v("aboutText", settings.aboutText)} style={input} />
      </div>

      <div style={field}>
        <label htmlFor="aboutPhoto" style={label}>{settings.aboutPhotoUrl ? "Replace your photo (optional)" : "Your photo (optional)"}</label>
        {settings.aboutPhotoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={settings.aboutPhotoUrl} alt="" style={{ display: "block", maxWidth: 160, maxHeight: 160, marginBottom: 10 }} />
        )}
        <input id="aboutPhoto" name="aboutPhoto" type="file" accept="image/*" style={{ fontSize: 16, maxWidth: "100%" }} {...invalid("aboutPhoto")} />
        {err("aboutPhoto")}
      </div>

      <div style={field}>
        <label htmlFor="contactEmail" style={label}>Contact email</label>
        <input id="contactEmail" name="contactEmail" type="email" defaultValue={v("contactEmail", settings.contactEmail)} style={input} {...invalid("contactEmail")} />
        {err("contactEmail")}
      </div>

      <div style={field}>
        <label htmlFor="instagramUrl" style={label}>Instagram link (optional)</label>
        <input id="instagramUrl" name="instagramUrl" inputMode="url" defaultValue={v("instagramUrl", settings.instagramUrl ?? "")} style={input} {...invalid("instagramUrl")} />
        {err("instagramUrl")}
      </div>

      {state.errors && <p style={{ color: "#777", fontSize: 14 }}>If you chose a photo, please choose it again before saving.</p>}
      {state.message && <p role="alert" style={errorStyle}>{state.message}</p>}
      {state.saved && <p role="status" style={{ color: "#2f6b3a", fontSize: 15 }}>Saved.</p>}

      <button type="submit" disabled={pending}
        style={{ padding: "12px 24px", fontSize: 16, fontWeight: 500, background: "#222", color: "#fff", border: 0, borderRadius: 4, cursor: "pointer" }}>
        {pending ? "Saving..." : "Save settings"}
      </button>
    </form>
  );
}
