import { describe, it, expect } from 'vitest';
import {
  availabilityToSlotSet,
  isSlotAvailableFromSet,
  formatDateForAvailabilityQuery,
} from '@shared/availability';

// Helpers to build DriCloud slot objects using the new localDateString contract.
function slot(
  year: number,
  month: number, // 1-based
  day: number,
  hour: number,
  minute: number,
  minutes = 30,
  desId = 1
): { localDateString: string; minutes: number; desId: number } {
  const yyyy = String(year);
  const mo = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const hh = String(hour).padStart(2, '0');
  const mi = String(minute).padStart(2, '0');
  return { localDateString: `${yyyy}-${mo}-${dd}T${hh}:${mi}`, minutes, desId };
}

// Simulates a JSON-deserialized slot as the browser client receives it after
// the W5 fix. The server now returns localDateString ("yyyy-MM-ddTHH:mm") — a
// plain string that survives JSON serialization without TZ conversion.
// This helper produces a slot as it would appear in the client's parsed JSON.
function jsonRoundTrippedSlot(
  wallClockNaive: string, // naive local datetime, e.g. "2026-06-23T09:00"
  _serverOffsetHours: number, // retained for documentation; irrelevant after fix
  minutes = 30,
  desId = 1
): { localDateString: string; minutes: number; desId: number } {
  // After the fix, the server sends localDateString directly — no TZ conversion
  // occurs in transit. The naive string is preserved exactly.
  return { localDateString: wallClockNaive, minutes, desId };
}

// ── W5: availabilityToSlotSet must work with JSON-deserialized string dates ────
//
// When the client calls response.json() on the server's availability response,
// slot.date is a UTC ISO string ("2026-06-23T07:00:00.000Z"), NOT a Date object.
// availabilityToSlotSet must extract the correct wall-clock HH:MM regardless of
// the TZ offset embedded in the UTC string.

describe('W5 — availabilityToSlotSet handles JSON-deserialized string dates', () => {
  it('returns the correct wall-clock HH:MM when slot arrives as a naive local string (server UTC+2)', () => {
    // After W5 fix: server sends localDateString "2026-06-23T09:00" — no TZ drift.
    // Previously the server sent date: new Date(2026,5,23,9,0) which JSON-serialized
    // to UTC "2026-06-23T07:00:00.000Z", making getHours() return undefined (string).
    const targetDate = new Date(2026, 5, 23); // June 23 2026
    const slots = [jsonRoundTrippedSlot('2026-06-23T09:00', 2)];
    const result = availabilityToSlotSet(slots, targetDate);
    // The displayed slot must be 09:00 — the original wall-clock time.
    expect(result.has('09:00')).toBe(true);
    expect(result.size).toBe(1);
  });

  it('excludes a JSON-deserialized slot from a different calendar day', () => {
    // Server wall-clock: 2026-06-24 09:00 — different day from target (June 23).
    const targetDate = new Date(2026, 5, 23); // looking at June 23
    const slots = [jsonRoundTrippedSlot('2026-06-24T09:00', 2)];
    const result = availabilityToSlotSet(slots, targetDate);
    expect(result.size).toBe(0);
  });
});

describe('availabilityToSlotSet', () => {
  const targetDate = new Date(2026, 5, 23); // June 23 2026 (month is 0-based)

  it('returns an empty set when the response array is empty', () => {
    const result = availabilityToSlotSet([], targetDate);
    expect(result.size).toBe(0);
  });

  it('returns HH:MM strings for slots that match the target date', () => {
    const slots = [
      slot(2026, 6, 23, 9, 0),
      slot(2026, 6, 23, 10, 30),
      slot(2026, 6, 23, 14, 0),
    ];
    const result = availabilityToSlotSet(slots, targetDate);
    expect(result.has('09:00')).toBe(true);
    expect(result.has('10:30')).toBe(true);
    expect(result.has('14:00')).toBe(true);
    expect(result.size).toBe(3);
  });

  it('excludes slots belonging to a different date', () => {
    const slots = [
      slot(2026, 6, 23, 9, 0),  // target date — keep
      slot(2026, 6, 24, 9, 0),  // next day — exclude
      slot(2026, 6, 22, 9, 0),  // previous day — exclude
    ];
    const result = availabilityToSlotSet(slots, targetDate);
    expect(result.size).toBe(1);
    expect(result.has('09:00')).toBe(true);
  });

  it('zero-pads single-digit hours and minutes', () => {
    const slots = [slot(2026, 6, 23, 8, 5)];
    const result = availabilityToSlotSet(slots, targetDate);
    expect(result.has('08:05')).toBe(true);
  });

  it('deduplicates slots that share the same time', () => {
    // DriCloud might return duplicate entries
    const slots = [
      slot(2026, 6, 23, 9, 0),
      slot(2026, 6, 23, 9, 0),
    ];
    const result = availabilityToSlotSet(slots, targetDate);
    expect(result.size).toBe(1);
  });

  it('handles multi-day response correctly', () => {
    // Simulates a diasRecuperar=7 response spanning a whole week
    const slots = [
      slot(2026, 6, 23, 9, 0),
      slot(2026, 6, 23, 11, 0),
      slot(2026, 6, 24, 9, 0),
      slot(2026, 6, 25, 14, 30),
    ];
    const result = availabilityToSlotSet(slots, targetDate);
    expect(result.size).toBe(2);
    expect(result.has('09:00')).toBe(true);
    expect(result.has('11:00')).toBe(true);
  });
});

describe('isSlotAvailableFromSet', () => {
  const weekend = new Date(2026, 5, 21); // Sunday June 21 2026
  const weekday = new Date(2026, 5, 23); // Tuesday

  it('returns false for Saturday', () => {
    const saturday = new Date(2026, 5, 20); // Saturday June 20
    const slotSet = new Set(['09:00']);
    expect(isSlotAvailableFromSet(slotSet, '09:00', saturday)).toBe(false);
  });

  it('returns false for Sunday', () => {
    const slotSet = new Set(['09:00']);
    expect(isSlotAvailableFromSet(slotSet, '09:00', weekend)).toBe(false);
  });

  it('returns false when the time is not in the slot set', () => {
    const slotSet = new Set(['09:00', '10:00']);
    expect(isSlotAvailableFromSet(slotSet, '11:00', weekday)).toBe(false);
  });

  it('returns true when the time is in the slot set on a weekday', () => {
    const slotSet = new Set(['09:00', '10:30']);
    expect(isSlotAvailableFromSet(slotSet, '09:00', weekday)).toBe(true);
    expect(isSlotAvailableFromSet(slotSet, '10:30', weekday)).toBe(true);
  });

  it('returns false when slotSet is null (loading state)', () => {
    expect(isSlotAvailableFromSet(null, '09:00', weekday)).toBe(false);
  });

  it('returns false when slotSet is an empty set', () => {
    expect(isSlotAvailableFromSet(new Set(), '09:00', weekday)).toBe(false);
  });
});

describe('formatDateForAvailabilityQuery', () => {
  it('formats a date as yyyyMMdd', () => {
    const date = new Date(2026, 5, 23); // June 23 2026
    expect(formatDateForAvailabilityQuery(date)).toBe('20260623');
  });

  it('zero-pads single-digit month and day', () => {
    const date = new Date(2026, 0, 5); // January 5 2026
    expect(formatDateForAvailabilityQuery(date)).toBe('20260105');
  });
});
