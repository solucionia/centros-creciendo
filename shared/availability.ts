/**
 * Pure transformation utilities for DriCloud availability data.
 *
 * Kept in shared/ so they can be imported by both the Node test suite
 * and the React client without pulling in any framework dependencies.
 */

export interface AvailabilitySlot {
  date: Date;
  minutes: number;
  desId: number;
}

/**
 * Converts a DriCloud availability response (an array of {date, minutes, desId})
 * into a Set of "HH:MM" time strings for a given calendar date.
 *
 * The API returns slots for a date range (diasRecuperar days); this function
 * filters to the single day the user has selected.
 */
export function availabilityToSlotSet(
  slots: AvailabilitySlot[],
  targetDate: Date
): Set<string> {
  const result = new Set<string>();
  for (const slot of slots) {
    if (isSameCalendarDay(slot.date, targetDate)) {
      const hh = slot.date.getHours().toString().padStart(2, '0');
      const mm = slot.date.getMinutes().toString().padStart(2, '0');
      result.add(`${hh}:${mm}`);
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

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
