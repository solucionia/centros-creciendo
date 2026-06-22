import { describe, it, expect } from "vitest";
import { resolveSessionSecret } from "./app";

describe("resolveSessionSecret", () => {
  it("throws in production when SESSION_SECRET is missing", () => {
    expect(() => resolveSessionSecret("production", undefined)).toThrow(/SESSION_SECRET/);
  });

  it("throws in production when SESSION_SECRET is empty", () => {
    expect(() => resolveSessionSecret("production", "")).toThrow(/SESSION_SECRET/);
  });

  it("returns the provided secret in production", () => {
    expect(resolveSessionSecret("production", "a-real-secret")).toBe("a-real-secret");
  });

  it("falls back to a dev secret outside production when missing", () => {
    const secret = resolveSessionSecret("development", undefined);
    expect(secret).toBeTruthy();
    expect(typeof secret).toBe("string");
  });
});
