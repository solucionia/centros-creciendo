/**
 * Unit tests for phone.ts — normalizePhone (existing) and isValidPhone (P2 Item 1).
 */

import { describe, it, expect } from 'vitest';
import { normalizePhone, isValidPhone } from './phone';

// ─── normalizePhone (existing contract — must stay green) ─────────────────────

describe('normalizePhone', () => {
  it('strips spaces, dashes, parens, dots', () => {
    expect(normalizePhone(' +34 600-111 222 ')).toBe('+34600111222');
  });

  it('returns empty string for undefined/null', () => {
    expect(normalizePhone(undefined)).toBe('');
    expect(normalizePhone(null)).toBe('');
  });

  // ── SHOULD-FIX 2: 00 international prefix canonicalization ──────────────────

  it('converts leading 00 IDD prefix to + (0034600111222 === +34600111222)', () => {
    // RED against current implementation (strips separators but not 00→+)
    expect(normalizePhone('0034600111222')).toBe('+34600111222');
  });

  it('converts 00 prefix after stripping separators (0034 600-111-222 → +34600111222)', () => {
    expect(normalizePhone('0034 600-111-222')).toBe('+34600111222');
  });

  it('collapses 00-prefixed and +-prefixed representations of the same number', () => {
    expect(normalizePhone('0034600111222')).toBe(normalizePhone('+34600111222'));
  });

  it('does NOT convert a single leading 0 national-trunk prefix to + (0600111222stays 0600111222)', () => {
    // /^00/ must not over-match a number that only has one leading zero
    expect(normalizePhone('0600111222')).toBe('0600111222');
  });

  it('does NOT alter a number that already starts with +', () => {
    expect(normalizePhone('+34600111222')).toBe('+34600111222');
  });
});

// ─── isValidPhone (P2 Item 1 — RED before implementation) ────────────────────

describe('isValidPhone', () => {
  // ── Valid phones — must NOT be rejected ──────────────────────────────────────

  it('accepts a standard E.164 Spanish mobile (+34600111222)', () => {
    expect(isValidPhone('+34600111222')).toBe(true);
  });

  it('accepts a number without leading + (national format, 9 digits)', () => {
    expect(isValidPhone('600111222')).toBe(true);
  });

  it('accepts a 7-digit number (minimum valid length)', () => {
    expect(isValidPhone('1234567')).toBe(true);
  });

  it('accepts a 15-digit number (maximum valid length)', () => {
    expect(isValidPhone('123456789012345')).toBe(true);
  });

  it('accepts a 15-digit number with leading + (E.164 max)', () => {
    expect(isValidPhone('+123456789012345')).toBe(true);
  });

  it('accepts a raw phone with spaces (normalizes to 11 digits)', () => {
    // "+34 600 111 222" normalizes to "+34600111222" = 12 chars, 11 digits
    expect(isValidPhone('+34 600 111 222')).toBe(true);
  });

  it('accepts a 00-prefixed international number (0034600111222 → +34600111222, 11 digits)', () => {
    // After 00→+ canonicalization, this normalizes to "+34600111222" — valid E.164
    expect(isValidPhone('0034600111222')).toBe(true);
  });

  it('accepts a phone with dashes (normalizes cleanly)', () => {
    expect(isValidPhone('600-111-222')).toBe(true);
  });

  // ── Invalid phones — must be rejected ────────────────────────────────────────

  it('rejects empty string', () => {
    expect(isValidPhone('')).toBe(false);
  });

  it('rejects undefined', () => {
    expect(isValidPhone(undefined)).toBe(false);
  });

  it('rejects null', () => {
    expect(isValidPhone(null)).toBe(false);
  });

  it('rejects a non-digit string ("abc")', () => {
    expect(isValidPhone('abc')).toBe(false);
  });

  it('rejects a string with only 3 digits (too short)', () => {
    expect(isValidPhone('123')).toBe(false);
  });

  it('rejects a 6-digit number (below 7-digit minimum)', () => {
    expect(isValidPhone('123456')).toBe(false);
  });

  it('rejects a 16-digit number (exceeds E.164 15-digit maximum)', () => {
    expect(isValidPhone('1234567890123456')).toBe(false);
  });

  it('rejects a 20-digit number (far too long)', () => {
    expect(isValidPhone('12345678901234567890')).toBe(false);
  });

  it('rejects a string that is just "+"', () => {
    expect(isValidPhone('+')).toBe(false);
  });

  it('rejects a string with letters mixed in after normalization ("abc123def")', () => {
    expect(isValidPhone('abc123def')).toBe(false);
  });

  it('rejects a plain object (non-string unknown)', () => {
    expect(isValidPhone({ phone: '600111222' })).toBe(false);
  });
});
