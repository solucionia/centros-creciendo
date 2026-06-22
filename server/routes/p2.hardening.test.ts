/**
 * P2 mechanical hardening tests — Issue #8 (P2 batch)
 *
 * Item 1: Phone format validation before hitting the CRM
 *   - Invalid phones rejected with 400 before any CRM call
 *   - Valid phone passes through to CRM (mocked)
 *
 * Item 3: TOCTOU — duplicate CRM contact under concurrency
 *   - Two concurrent request-otp calls for the same new phone
 *     must result in createContact being called exactly once
 *   - Structural unit test: findOrCreateContact called with controlled promise
 *     resolution proves the lock prevents a second createContact call
 *
 * NIT 5b: 400 (invalid phone) path must not call findContactByPhone or createContact
 *
 * Item 2's resolveTrustProxy is tested in server/lib/trustProxy.test.ts.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import * as crmService from '../services/crmService';
import * as otpService from '../services/otpService';
import { findOrCreateContact } from './auth.routes';

// ── Item 1: Phone validation — invalid phones rejected before CRM ──────────────

describe('P2 Item 1 — POST /api/auth/request-otp phone format validation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects empty phoneNumber with 400 and does not call CRM', async () => {
    const { app } = await createApp();
    const findSpy = vi.spyOn(crmService, 'findContactByPhone');

    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({ phoneNumber: '' });

    expect(res.status).toBe(400);
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('rejects "abc" with 400 and does not call CRM', async () => {
    const { app } = await createApp();
    const findSpy = vi.spyOn(crmService, 'findContactByPhone');

    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({ phoneNumber: 'abc' });

    expect(res.status).toBe(400);
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('rejects "123" (too short, 3 digits) with 400 and does not call CRM', async () => {
    const { app } = await createApp();
    const findSpy = vi.spyOn(crmService, 'findContactByPhone');

    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({ phoneNumber: '123' });

    expect(res.status).toBe(400);
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('rejects a 20-digit number with 400 and does not call CRM', async () => {
    const { app } = await createApp();
    const findSpy = vi.spyOn(crmService, 'findContactByPhone');

    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({ phoneNumber: '12345678901234567890' });

    expect(res.status).toBe(400);
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('rejects missing phoneNumber field with 400 and does not call CRM', async () => {
    const { app } = await createApp();
    const findSpy = vi.spyOn(crmService, 'findContactByPhone');

    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({});

    expect(res.status).toBe(400);
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('allows a valid phone through and calls CRM (mocked)', async () => {
    const { app } = await createApp();
    vi.spyOn(crmService, 'findContactByPhone').mockResolvedValue('contact-123');
    vi.spyOn(otpService, 'createOtp').mockReturnValue('111111');
    vi.spyOn(crmService, 'setOtpField').mockResolvedValue(undefined);

    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({ phoneNumber: '+34600111222' });

    expect(res.status).toBe(200);
    expect(crmService.findContactByPhone).toHaveBeenCalledWith('+34600111222');
  });
});

// ── Item 3: TOCTOU — concurrent requests for the same new phone ───────────────

describe('P2 Item 3 — request-otp TOCTOU: concurrent new-phone requests (HTTP level)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls createContact exactly once when two concurrent requests race for the same new phone', async () => {
    const { app } = await createApp();

    // findContactByPhone always returns null (new phone, never seen before)
    vi.spyOn(crmService, 'findContactByPhone').mockResolvedValue(null);

    // createContact resolves after a tiny delay to make the race realistic
    const createSpy = vi
      .spyOn(crmService, 'createContact')
      .mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('contact-race'), 10)),
      );

    vi.spyOn(otpService, 'createOtp').mockReturnValue('222222');
    vi.spyOn(crmService, 'setOtpField').mockResolvedValue(undefined);

    // Fire two concurrent requests for the same phone without awaiting between them
    const [res1, res2] = await Promise.all([
      request(app).post('/api/auth/request-otp').send({ phoneNumber: '+34611999888' }),
      request(app).post('/api/auth/request-otp').send({ phoneNumber: '+34611999888' }),
    ]);

    // Both responses should succeed
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // createContact must have been called exactly once despite the race
    expect(createSpy).toHaveBeenCalledTimes(1);
  });
});

// ── Item 3 (SHOULD-FIX 5a): structural unit test for the lock mechanism ───────
//
// Tests findOrCreateContact directly with a manually-controlled promise so that
// serialization is proven structurally — not by relying on setTimeout timing.
// Two calls are issued before the first createContact promise resolves; we verify
// that both settle with the same contactId AND createContact was called only once.

describe('P2 SHOULD-FIX 5a — findOrCreateContact structural lock test', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('both concurrent callers receive the same contactId and createContact is invoked exactly once', async () => {
    // findContactByPhone returns null — phone is new, so createContact will be needed.
    vi.spyOn(crmService, 'findContactByPhone').mockResolvedValue(null);

    // createContact: we hold a manual resolve handle so we control exactly when it settles.
    let resolveCreate!: (id: string) => void;
    const createPromise = new Promise<string>((resolve) => {
      resolveCreate = resolve;
    });
    const createSpy = vi.spyOn(crmService, 'createContact').mockReturnValue(createPromise);

    // Fire both calls before the first has settled.
    // Both calls use the same normalized phone key, so the second must attach to
    // the in-flight promise rather than triggering a second createContact call.
    const call1 = findOrCreateContact('+34699000001');
    const call2 = findOrCreateContact('+34699000001');

    // Yield to the microtask queue so the async IIFE inside findOrCreateContact
    // has run far enough to call findContactByPhone and createContact.
    await Promise.resolve();
    await Promise.resolve(); // two ticks: one for findContactByPhone, one for createContact entry

    // createContact must have been called exactly once — the second caller attached
    // to the in-flight promise without initiating a new operation.
    expect(createSpy).toHaveBeenCalledTimes(1);

    // Now release the lock — both callers should receive the same id.
    resolveCreate('contact-structural-lock');
    const [id1, id2] = await Promise.all([call1, call2]);

    expect(id1).toBe('contact-structural-lock');
    expect(id2).toBe('contact-structural-lock');
    // Still exactly one createContact call after both callers settled.
    expect(createSpy).toHaveBeenCalledTimes(1);
  });
});

// ── NIT 5b: invalid phone (400) must not call findContactByPhone or createContact ──

describe('P2 NIT 5b — 400 response for invalid phone calls no CRM functions', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not call findContactByPhone or createContact when the phone is invalid', async () => {
    const { app } = await createApp();
    const findSpy = vi.spyOn(crmService, 'findContactByPhone');
    const createSpy = vi.spyOn(crmService, 'createContact');

    const res = await request(app)
      .post('/api/auth/request-otp')
      .send({ phoneNumber: 'not-a-phone' });

    expect(res.status).toBe(400);
    expect(findSpy).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });
});
