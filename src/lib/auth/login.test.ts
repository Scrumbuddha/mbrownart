import { describe, expect, it } from "vitest";
import { createTestDb } from "../db/test-db";
import { loginAttempts } from "../db/schema";
import { attemptLogin } from "./login";
import { recordFailure } from "./rate-limit";
import { verifySessionToken } from "./session";

const now = new Date("2026-10-22T12:00:00Z");
const secret = "s".repeat(32);
const base = { ip: "1.1.1.1", now, expected: "right", secret };
const rows = async (db: Awaited<ReturnType<typeof createTestDb>>) =>
  (await db.select().from(loginAttempts)).length;

describe("attemptLogin", () => {
  it("refuses a rate-limited IP even with the right password", async () => {
    const db = await createTestDb();
    for (let i = 0; i < 5; i++) await recordFailure(db, "1.1.1.1", now);
    expect(await attemptLogin(db, { ...base, password: "right" })).toEqual({ ok: false, error: "limited" });
  });

  it("records an attempt on a wrong password", async () => {
    const db = await createTestDb();
    expect(await attemptLogin(db, { ...base, password: "nope" })).toEqual({ ok: false, error: "wrong" });
    expect(await rows(db)).toBe(1);
  });

  it("leaves no attempt row on success and returns a valid token", async () => {
    const db = await createTestDb();
    await attemptLogin(db, { ...base, password: "nope" });
    const r = await attemptLogin(db, { ...base, password: "right" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(await verifySessionToken(secret, r.token, now)).toBe(true);
    expect(await rows(db)).toBe(1); // the earlier failure remains; the success row is gone
  });

  it("limits concurrent guesses: 6 parallel attempts, only 5 get compared", async () => {
    const db = await createTestDb();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => attemptLogin(db, { ...base, password: "nope" })),
    );
    expect(results.filter((r) => !r.ok && r.error === "wrong")).toHaveLength(5);
    expect(results.filter((r) => !r.ok && r.error === "limited")).toHaveLength(1);
    expect(await rows(db)).toBe(6);
  });

  it("prunes rows older than the window", async () => {
    const db = await createTestDb();
    await recordFailure(db, "9.9.9.9", new Date(now.getTime() - 60 * 60 * 1000));
    await attemptLogin(db, { ...base, password: "nope" });
    expect(await rows(db)).toBe(1);
  });

  it("fails closed when misconfigured, without touching the DB", async () => {
    const db = await createTestDb();
    for (const o of [{ expected: "" }, { secret: "" }, { secret: "short" }]) {
      expect(await attemptLogin(db, { ...base, password: "right", ...o })).toEqual({ ok: false, error: "misconfigured" });
    }
    expect(await rows(db)).toBe(0);
  });
});
