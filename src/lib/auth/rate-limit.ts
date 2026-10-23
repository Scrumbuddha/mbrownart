import { and, eq, gt, lt, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client";
import { loginAttempts } from "../db/schema";

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;

export async function isRateLimited(db: Db, ip: string, now: Date): Promise<boolean> {
  const since = new Date(now.getTime() - WINDOW_MS);
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.at, since)));
  return (row?.n ?? 0) >= MAX_FAILURES;
}

export async function recordFailure(db: Db, ip: string, now: Date): Promise<void> {
  await db.insert(loginAttempts).values({ ip, at: now });
}

/**
 * Claim an attempt slot before checking the password (closes the check-then-act race).
 * Inserts a row, prunes expired rows, and counts rows in the window up to and including this one.
 */
export async function claimAttempt(
  db: Db,
  ip: string,
  now: Date,
): Promise<{ id: number; limited: boolean }> {
  const since = new Date(now.getTime() - WINDOW_MS);
  await db.delete(loginAttempts).where(lt(loginAttempts.at, since));
  const [row] = await db.insert(loginAttempts).values({ ip, at: now }).returning({ id: loginAttempts.id });
  // Rank by id: only the first MAX_FAILURES claims in the window may compare a password,
  // however the concurrent requests interleave.
  const [c] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.ip, ip), gt(loginAttempts.at, since), lte(loginAttempts.id, row.id)));
  return { id: row.id, limited: (c?.n ?? 0) > MAX_FAILURES };
}

export async function clearAttempt(db: Db, id: number): Promise<void> {
  await db.delete(loginAttempts).where(eq(loginAttempts.id, id));
}
