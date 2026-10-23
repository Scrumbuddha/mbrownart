import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const SESSION_COOKIE = "studio_session";
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

const key = (secret: string) => new TextEncoder().encode(secret);

export async function createSessionToken(secret: string, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("artist")
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_MAX_AGE_S)
    .sign(key(secret));
}

export async function verifySessionToken(
  secret: string,
  token: string | undefined,
  now: Date,
): Promise<boolean> {
  if (!token || !secret) return false;
  try {
    const { payload } = await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      subject: "artist",
      currentDate: now,
    });
    return payload.sub === "artist";
  } catch {
    return false;
  }
}

/** Constant-time comparison. Pure JS (no node:crypto) so it is safe in any runtime. */
export function checkPassword(input: string, expected: string): boolean {
  const enc = new TextEncoder();
  const a = enc.encode(input);
  const b = enc.encode(expected);
  let diff = a.length ^ b.length;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** True when the request carries a valid Studio session cookie. Fails closed if SESSION_SECRET is unset. */
export async function isStudioRequest(): Promise<boolean> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(secret, token, new Date());
}

/** For server actions and pages: redirects to /studio/login when not signed in. */
export async function requireStudio(): Promise<void> {
  if (!(await isStudioRequest())) redirect("/studio/login");
}
