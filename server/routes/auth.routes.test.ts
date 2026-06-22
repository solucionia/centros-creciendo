import { describe, it, expect } from "vitest";
import request from "supertest";
import { createApp } from "../app";

describe("POST /api/auth/verify-otp rate limiting", () => {
  it("blocks with 429 after too many failed attempts from the same client", async () => {
    const { app } = await createApp();
    const phoneNumber = "+34600111333";

    // No active OTP exists, so every attempt is a 401 (not_found) until the
    // network-level limiter trips. Exhaust the allowed window first.
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post("/api/auth/verify-otp")
        .send({ phoneNumber, otp: "000000" });
      expect(res.status).toBe(401);
    }

    const blocked = await request(app)
      .post("/api/auth/verify-otp")
      .send({ phoneNumber, otp: "000000" });

    expect(blocked.status).toBe(429);
  });
});
