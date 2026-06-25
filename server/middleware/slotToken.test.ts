import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encodeSlot, decodeSlot, InvalidSlotError, type SlotPayload } from './slotToken';

const SECRET = 'test-secret-32-chars-minimum-ok!';

const samplePayload: SlotPayload = {
  u: 42,
  f: '2026-07-10',
  h: '09:00',
  t: 7,
  d: 3,
  m: 30,
  esp: 5,
};

beforeEach(() => {
  process.env.GHL_MIDDLEWARE_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.GHL_MIDDLEWARE_SECRET;
});

describe('encodeSlot / decodeSlot', () => {
  it('round-trips a payload without mutation', () => {
    const token = encodeSlot(samplePayload);
    const decoded = decodeSlot(token);
    expect(decoded).toEqual(samplePayload);
  });

  it('produces a string with exactly one "." separator', () => {
    const token = encodeSlot(samplePayload);
    expect(token.split('.').length).toBe(2);
  });

  it('token contains only base64url-safe chars (A-Za-z0-9_-.)', () => {
    const token = encodeSlot(samplePayload);
    expect(token).toMatch(/^[A-Za-z0-9_\-\.]+$/);
  });

  it('handles null fields (d: null, esp: null)', () => {
    const p: SlotPayload = { ...samplePayload, d: null, esp: null };
    expect(decodeSlot(encodeSlot(p))).toEqual(p);
  });

  it('throws InvalidSlotError for a tampered payload segment', () => {
    const token = encodeSlot(samplePayload);
    const [, sig] = token.split('.');
    const fakePayload = Buffer.from(JSON.stringify({ ...samplePayload, u: 9999 })).toString('base64url');
    expect(() => decodeSlot(`${fakePayload}.${sig}`)).toThrow(InvalidSlotError);
  });

  it('throws InvalidSlotError for a tampered signature segment', () => {
    const token = encodeSlot(samplePayload);
    const [payload] = token.split('.');
    expect(() => decodeSlot(`${payload}.invalidsig`)).toThrow(InvalidSlotError);
  });

  it('throws InvalidSlotError for a token with no "." separator', () => {
    expect(() => decodeSlot('nodottoken')).toThrow(InvalidSlotError);
  });

  it('throws InvalidSlotError for an empty string', () => {
    expect(() => decodeSlot('')).toThrow(InvalidSlotError);
  });

  it('throws when GHL_MIDDLEWARE_SECRET is absent', () => {
    delete process.env.GHL_MIDDLEWARE_SECRET;
    expect(() => encodeSlot(samplePayload)).toThrow(/GHL_MIDDLEWARE_SECRET/);
  });
});
