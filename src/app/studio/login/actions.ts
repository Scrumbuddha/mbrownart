"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { attemptLogin } from "@/lib/auth/login";
import { SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/auth/session";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const result = await attemptLogin(getDb(), {
    ip,
    password: String(formData.get("password") ?? "").trim(),
    now: new Date(),
    // Values pasted into Vercel often carry a stray space or newline.
    expected: process.env.STUDIO_PASSWORD?.trim(),
    secret: process.env.SESSION_SECRET?.trim(),
  });

  if (!result.ok) {
    if (result.error === "misconfigured") {
      console.error("Studio login disabled: STUDIO_PASSWORD missing or SESSION_SECRET missing/under 32 characters.");
      return {
        error:
          "Studio sign-in isn't set up on this site yet. In Vercel, check STUDIO_PASSWORD and SESSION_SECRET (32+ characters) for this environment, then redeploy.",
      };
    }
    return {
      error:
        result.error === "limited"
          ? "Too many tries. Wait 15 minutes and try again."
          : "That password isn't right.",
    };
  }

  (await cookies()).set(SESSION_COOKIE, result.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
  redirect("/studio");
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/studio/login");
}
