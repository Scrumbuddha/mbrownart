import { afterEach, describe, expect, it, vi } from "vitest";
import { logPoolError } from "./client";

afterEach(() => vi.restoreAllMocks());

describe("logPoolError", () => {
  it("logs only the error name, never the message (it can carry the connection string)", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = new Error("connect to postgres://user:secret@host/db failed");
    e.name = "NeonDbError";
    logPoolError(e);
    expect(spy).toHaveBeenCalledWith("Postgres pool error:", "NeonDbError");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("secret");
    logPoolError("weird");
    expect(spy).toHaveBeenLastCalledWith("Postgres pool error:", "unknown");
  });
});
