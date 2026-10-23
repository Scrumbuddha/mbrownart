"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { isRateLimited, recordFailure } from "@/lib/auth/rate-limit";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  checkPassword,
  createSessionToken,
} from "@/lib/auth/session";

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const expected = process.env.STUDIO_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!expected || !secret) {
    console.error("Studio login disabled: STUDIO_PASSWORD or SESSION_SECRET is not set.");
    return { error: "That password isn't right." };
  }

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const db = getDb();
  const now = new Date();

  if (await isRateLimited(db, ip, now)) {
    return { error: "Too many tries. Wait 15 minutes and try again." };
  }

  const input = String(formData.get("password") ?? "");
  if (!checkPassword(input, expected)) {
    await recordFailure(db, ip, now);
    return { error: "That password isn't right." };
  }

  (await cookies()).set(SESSION_COOKIE, await createSessionToken(secret, now), {
    httpOnly: true,
    secure: true,
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
