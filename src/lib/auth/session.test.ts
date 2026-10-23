import { describe, expect, it } from "vitest";
import { checkPassword, createSessionToken, verifySessionToken } from "./session";

const now = new Date("2026-10-22T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

describe("session token", () => {
  it("verifies with the right secret", async () => {
    const t = await createSessionToken("secret-one", now);
    expect(await verifySessionToken("secret-one", t, now)).toBe(true);
    expect(await verifySessionToken("secret-one", t, new Date(now.getTime() + 29 * day))).toBe(true);
  });
  it("fails with the wrong secret", async () => {
    const t = await createSessionToken("secret-one", now);
    expect(await verifySessionToken("secret-two", t, now)).toBe(false);
  });
  it("fails 31 days later", async () => {
    const t = await createSessionToken("secret-one", now);
    expect(await verifySessionToken("secret-one", t, new Date(now.getTime() + 31 * day))).toBe(false);
  });
  it("fails for missing or garbage tokens", async () => {
    expect(await verifySessionToken("s", undefined, now)).toBe(false);
    expect(await verifySessionToken("s", "garbage", now)).toBe(false);
  });
});

describe("checkPassword", () => {
  it("matches only the exact password", () => {
    expect(checkPassword("hunter2", "hunter2")).toBe(true);
    expect(checkPassword("hunter3", "hunter2")).toBe(false);
    expect(checkPassword("hunter", "hunter2")).toBe(false);
    expect(checkPassword("", "hunter2")).toBe(false);
  });
});
