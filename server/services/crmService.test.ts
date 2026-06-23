// Unit tests for crmService — mocks global.fetch so no real network calls are made.
// Written RED-first (TDD): tests for findContactByPhone pin the corrected duplicate-search
// endpoint before the fix is applied; tests for createContact and updateOtpField lock
// the existing (already-correct) contracts in place.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  findContactByPhone,
  createContact,
  setOtpField,
  clearOtpField,
} from "./crmService";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    })
  );
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── findContactByPhone ───────────────────────────────────────────────────────

describe("findContactByPhone", () => {
  it("calls the duplicate-search endpoint with the correct URL and method", async () => {
    mockFetch(200, { contact: { id: "abc123" } });

    await findContactByPhone("+34600111222");

    const fetchMock = vi.mocked(global.fetch);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    // Must use the duplicate-search path — not /contacts/search
    expect(url).toContain("/contacts/search/duplicate");

    // Must pass the phone as the `number` query param (URL-encoded)
    expect(url).toContain("number=%2B34600111222");

    // Must be a GET
    expect(init?.method).toBe("GET");
  });

  it("carries Authorization and Version headers", async () => {
    mockFetch(200, { contact: { id: "abc123" } });

    await findContactByPhone("+34600111222");

    const [, init] = (vi.mocked(global.fetch).mock.calls[0] as [
      string,
      RequestInit,
    ]);
    const headers = init?.headers as Record<string, string>;

    expect(headers["Authorization"]).toMatch(/^Bearer /);
    expect(headers["Version"]).toBe("2021-07-28");
  });

  it("returns the contact id when the API responds with { contact: { id } }", async () => {
    mockFetch(200, { contact: { id: "contact-xyz" } });

    const result = await findContactByPhone("+34600111222");

    expect(result).toBe("contact-xyz");
  });

  it("returns null when the API responds with { contact: null }", async () => {
    mockFetch(200, { contact: null });

    const result = await findContactByPhone("+34600111222");

    expect(result).toBeNull();
  });

  it("throws on non-ok HTTP status", async () => {
    mockFetch(400, { error: "Contact with id search not found" });

    await expect(findContactByPhone("+34600111222")).rejects.toThrow(
      /CRM search failed/
    );
  });
});

// ─── createContact ────────────────────────────────────────────────────────────

describe("createContact", () => {
  it("calls POST /contacts/ with locationId and phone in the body", async () => {
    mockFetch(200, { contact: { id: "new-contact-id" } });

    await createContact("+34600111222");

    const fetchMock = vi.mocked(global.fetch);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toMatch(/\/contacts\/$/);
    expect(init?.method).toBe("POST");

    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({ phone: "+34600111222" });
    expect(body).toHaveProperty("locationId");
  });

  it("returns the contact id on success", async () => {
    mockFetch(200, { contact: { id: "new-contact-id" } });

    const result = await createContact("+34600111222");

    expect(result).toBe("new-contact-id");
  });

  it("throws on non-ok HTTP status", async () => {
    mockFetch(422, { error: "Unprocessable" });

    await expect(createContact("+34600111222")).rejects.toThrow(
      /CRM create failed/
    );
  });
});

// ─── setOtpField / clearOtpField (via updateOtpField) ────────────────────────

describe("setOtpField", () => {
  it("calls PUT /contacts/{id} with customFields containing the OTP value", async () => {
    mockFetch(200, {});

    await setOtpField("contact-123", "456789");

    const fetchMock = vi.mocked(global.fetch);
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toContain("/contacts/contact-123");
    expect(init?.method).toBe("PUT");

    const body = JSON.parse(init?.body as string);
    expect(body).toHaveProperty("customFields");
    expect(Array.isArray(body.customFields)).toBe(true);

    const field = body.customFields[0];
    expect(field).toHaveProperty("id");
    expect(field.field_value).toBe("456789");
  });

  it("throws on non-ok HTTP status", async () => {
    mockFetch(500, { error: "Internal error" });

    await expect(setOtpField("contact-123", "456789")).rejects.toThrow(
      /CRM update field failed/
    );
  });
});

describe("clearOtpField", () => {
  it("calls PUT /contacts/{id} with an empty field_value", async () => {
    mockFetch(200, {});

    await clearOtpField("contact-123");

    const [, init] = (vi.mocked(global.fetch).mock.calls[0] as [
      string,
      RequestInit,
    ]);
    const body = JSON.parse(init?.body as string);

    expect(body.customFields[0].field_value).toBe("");
  });
});
