/**
 * Unit tests for mapper.ts helpers — W1 timezone regression.
 *
 * naiveLocalStringToDateTimeForDriCloud: pure string→string transform that
 * converts "yyyy-MM-ddTHH:mm" to "yyyyMMddHHmm" without passing through Date,
 * so server-local TZ can never corrupt the wall-clock slot the user picked.
 */

import { describe, it, expect } from 'vitest';
import {
  naiveLocalStringToDateTimeForDriCloud,
  formatDateTimeForDriCloud,
  formatDateForDriCloud,
  parseDisponibilidad,
} from './mapper';

// ── naiveLocalStringToDateTimeForDriCloud ────────────────────────────────────
//
// These tests are TZ-independent because no Date object is involved.
// The function must work correctly regardless of the machine's local timezone.

describe('naiveLocalStringToDateTimeForDriCloud', () => {
  // ── Happy path ───────────────────────────────────────────────────────────────

  it('converts "2025-07-15T10:00" → "202507151000"', () => {
    expect(naiveLocalStringToDateTimeForDriCloud('2025-07-15T10:00')).toBe('202507151000');
  });

  it('converts "2025-01-01T00:00" → "202501010000" (midnight)', () => {
    expect(naiveLocalStringToDateTimeForDriCloud('2025-01-01T00:00')).toBe('202501010000');
  });

  it('converts "2025-12-31T23:59" → "202512312359" (end of year)', () => {
    expect(naiveLocalStringToDateTimeForDriCloud('2025-12-31T23:59')).toBe('202512312359');
  });

  it('converts "2024-02-29T08:30" → "202402290830" (leap day)', () => {
    expect(naiveLocalStringToDateTimeForDriCloud('2024-02-29T08:30')).toBe('202402290830');
  });

  it('output is exactly 12 digits, no "+", "-", "Z", "T", or ":" chars', () => {
    const result = naiveLocalStringToDateTimeForDriCloud('2025-07-15T10:00');
    expect(result).toMatch(/^\d{12}$/);
  });

  it('preserves wall-clock 10:00 regardless of what toISOString() would produce', () => {
    // TZ-independent proof: a 10:00 wall-clock slot must always produce "...1000"
    // at the end of the DriCloud string, not "...0800" (UTC offset of CEST+2).
    const result = naiveLocalStringToDateTimeForDriCloud('2025-07-15T10:00');
    expect(result.slice(-4)).toBe('1000');
  });

  it('does NOT throw for well-formed "yyyy-MM-ddTHH:mm" (regression guard)', () => {
    expect(() => naiveLocalStringToDateTimeForDriCloud('2025-07-15T10:00')).not.toThrow();
  });

  // ── Input validation — malformed inputs must throw, not produce garbage ──────
  //
  // Chosen behavior for the seconds case: THROW.
  // Rationale: the function's contract is "yyyy-MM-ddTHH:mm" only. Silently
  // truncating "HH:mm:ss" would mask callers that deviate from the contract.
  // The client already sends "HH:mm" (no seconds), so normalization offers no
  // real benefit and would only hide bugs. Fail loudly instead.

  it('throws for input with trailing Z ("2027-01-20T10:00:00Z" — UTC ISO, not naive)', () => {
    expect(() => naiveLocalStringToDateTimeForDriCloud('2027-01-20T10:00:00Z')).toThrow(
      /Invalid naive datetime/,
    );
  });

  it('throws for input with seconds but no Z ("2027-01-20T10:00:00" — not yyyy-MM-ddTHH:mm)', () => {
    expect(() => naiveLocalStringToDateTimeForDriCloud('2027-01-20T10:00:00')).toThrow(
      /Invalid naive datetime/,
    );
  });

  it('throws for input with UTC offset ("2027-01-20T10:00+02:00")', () => {
    expect(() => naiveLocalStringToDateTimeForDriCloud('2027-01-20T10:00+02:00')).toThrow(
      /Invalid naive datetime/,
    );
  });

  it('throws for completely invalid input (empty string)', () => {
    expect(() => naiveLocalStringToDateTimeForDriCloud('')).toThrow(/Invalid naive datetime/);
  });

  it('throws for a plain date without time ("2027-01-20")', () => {
    expect(() => naiveLocalStringToDateTimeForDriCloud('2027-01-20')).toThrow(
      /Invalid naive datetime/,
    );
  });
});

// ── Existing helpers (regression guard — must stay green) ────────────────────

describe('formatDateForDriCloud', () => {
  it('returns yyyyMMdd for a given Date (TZ-aware, uses local methods)', () => {
    // This function uses Date.getFullYear/getMonth/getDate — it intentionally
    // reads LOCAL calendar fields. Testing with a year/month/day that is stable
    // in any timezone. We use local Date construction to match its behavior.
    const d = new Date(2025, 6, 15); // local July 15 2025
    expect(formatDateForDriCloud(d)).toBe('20250715');
  });
});

describe('formatDateTimeForDriCloud', () => {
  it('returns yyyyMMddHHmm using local Date fields', () => {
    // NOTE: this function is TZ-dependent (uses getHours/getMinutes in local TZ).
    // We construct a local date directly so the test matches regardless of machine TZ.
    const d = new Date(2025, 6, 15, 10, 30); // local July 15 2025 10:30
    expect(formatDateTimeForDriCloud(d)).toBe('202507151030');
  });
});

// ── parseDisponibilidad ───────────────────────────────────────────────────────
//
// W5: parseDisponibilidad must return a naive local string ("yyyy-MM-ddTHH:mm"),
// NOT a Date object. This prevents TZ drift across the server-to-client JSON
// boundary: JSON.stringify(Date) produces a UTC ISO string, which would shift the
// displayed slot time when the server TZ differs from the browser TZ.

describe('parseDisponibilidad', () => {
  it('returns localDateString "2026-06-23T09:00" for "202606230900:30:1"', () => {
    const result = parseDisponibilidad('202606230900:30:1');
    expect(result.localDateString).toBe('2026-06-23T09:00');
  });

  it('parses minutes and desId correctly', () => {
    const result = parseDisponibilidad('202606230900:30:5');
    expect(result.minutes).toBe(30);
    expect(result.desId).toBe(5);
  });

  it('localDateString does NOT contain "Z" or UTC offset (must be naive)', () => {
    const result = parseDisponibilidad('202606230900:30:1');
    expect(result.localDateString).not.toMatch(/Z|[+-]\d{2}:\d{2}/);
  });

  it('preserves wall-clock time exactly — "T09:00" regardless of machine TZ', () => {
    // Pure string slicing: no Date constructor, so no TZ conversion can occur.
    const result = parseDisponibilidad('202606230900:30:1');
    expect(result.localDateString.slice(11)).toBe('09:00');
  });
});
