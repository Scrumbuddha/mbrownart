import { describe, expect, it } from "vitest";
import { createTestDb } from "../db/test-db";
import { isRateLimited, recordFailure } from "./rate-limit";

const now = new Date("2026-10-22T12:00:00Z");
const min = 60 * 1000;

describe("login rate limit", () => {
  it("limits after 5 failures and recovers after 16 minutes", async () => {
    const db = await createTestDb();
    for (let i = 0; i < 4; i++) await recordFailure(db, "1.1.1.1", now);
    expect(await isRateLimited(db, "1.1.1.1", now)).toBe(false);
    await recordFailure(db, "1.1.1.1", now);
    expect(await isRateLimited(db, "1.1.1.1", now)).toBe(true);
    expect(await isRateLimited(db, "2.2.2.2", now)).toBe(false);
    expect(await isRateLimited(db, "1.1.1.1", new Date(now.getTime() + 16 * min))).toBe(false);
  });
});
