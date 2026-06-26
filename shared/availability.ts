/**
 * Pure transformation utilities for DriCloud availability data.
 *
 * Kept in shared/ so they can be imported by both the Node test suite
 * and the React client without pulling in any framework dependencies.
 */

export interface AvailabilitySlot {
  /**
   * Wall-clock datetime as a naive local string: "yyyy-MM-ddTHH:mm".
   * Stored as a string (not Date) so that JSON serialization across the
   * server-to-client boundary cannot introduce timezone drift — a Date
   * serialized by JSON.stringify becomes a UTC ISO string, which would
   * shift displayed times when the server TZ differs from the browser TZ.
   */
  localDateString: string;
  minutes: number;
  desId: number;
}

/**
 * Converts a DriCloud availability response (an array of {localDateString, minutes, desId})
 * into a Set of "HH:MM" time strings for a given calendar date.
 *
 * The API returns slots for a date range (diasRecuperar days); this function
 * filters to the single day the user has selected.
 *
 * Uses string-based comparisons so the displayed wall-clock is always the
 * server's intended local time, regardless of server or browser TZ settings.
 */
export function availabilityToSlotSet(
  slots: AvailabilitySlot[],
  targetDate: Date
): Set<string> {
  // Format targetDate as "yyyy-MM-dd" using local time accessors so the
  // comparison is calendar-day accurate in the browser's local TZ.
  const targetYMD = formatLocalYMD(targetDate);
  const result = new Set<string>();
  for (const slot of slots) {
    // localDateString is "yyyy-MM-ddTHH:mm"; the date portion is the first 10 chars.
    if (slot.localDateString.slice(0, 10) === targetYMD) {
      // Time portion is chars 11–15 (HH:MM).
      result.add(slot.localDateString.slice(11, 16));
    }
  }
  return result;
}

/**
 * Returns true when a given time slot is available for the target date.
 *
 * - Returns false for weekends (Saturday=6, Sunday=0).
 * - Returns false when slotSet is null (data still loading).
 * - Returns false when the time string is not present in the slotSet.
 */
export function isSlotAvailableFromSet(
  slotSet: Set<string> | null,
  time: string,
  date: Date
): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  if (!slotSet) return false;
  return slotSet.has(time);
}

/**
 * Formats a Date as "yyyyMMdd" for use as the `fecha` query param in
 * GET /api/dricloud/availability.
 */
export function formatDateForAvailabilityQuery(date: Date): string {
  const yyyy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

/** Formats a Date as "yyyy-MM-dd" using local time accessors. */
function formatLocalYMD(d: Date): string {
  const yyyy = d.getFullYear().toString();
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
