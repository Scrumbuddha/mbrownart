import { and, eq, gt, sql } from "drizzle-orm";
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
