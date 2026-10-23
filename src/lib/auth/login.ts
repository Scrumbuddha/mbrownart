import type { Db } from "../db/client";
import { claimAttempt, clearAttempt } from "./rate-limit";
import { MIN_SECRET_LENGTH, checkPassword, createSessionToken } from "./session";

export type LoginResult =
  | { ok: true; token: string }
  | { ok: false; error: "wrong" | "limited" | "misconfigured" };

export async function attemptLogin(
  db: Db,
  args: { ip: string; password: string; now: Date; expected: string | undefined; secret: string | undefined },
): Promise<LoginResult> {
  const { ip, password, now, expected, secret } = args;
  if (!expected || !secret || secret.length < MIN_SECRET_LENGTH) {
    return { ok: false, error: "misconfigured" };
  }
  const { id, limited } = await claimAttempt(db, ip, now);
  if (limited) return { ok: false, error: "limited" };
  if (!checkPassword(password, expected)) return { ok: false, error: "wrong" };
  await clearAttempt(db, id);
  return { ok: true, token: await createSessionToken(secret, now) };
}
