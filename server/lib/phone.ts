/**
 * Normalizes a phone number string for consistent comparison.
 * - Strips spaces, dashes, parens, dots.
 * - Converts a leading IDD prefix "00" to "+" (e.g. 0034… → +34…) so that
 *   international numbers entered with the 00 convention and the + convention
 *   resolve to the same canonical form, preventing duplicate CRM contacts.
 *   Only a strictly leading "00" is replaced — a single leading "0" (national
 *   trunk prefix, e.g. 0600111222) is left untouched.
 * Mirrors the implementation originally in auth.routes.ts — single source of truth.
 */
export function normalizePhone(raw: unknown): string {
  const stripped = String(raw ?? '').trim().replace(/[\s\-().]/g, '');
  // Convert leading IDD prefix "00" → "+" (E.164 standard).
  // /^00/ anchors strictly at the start, so "0600111222" (one leading zero) is unaffected.
  return stripped.replace(/^00/, '+');
}

/**
 * Conservative E.164-style phone validation.
 * After normalization, a valid phone must consist only of an optional leading
 * '+' followed by 7–15 digits. Rejects empty, too-short, too-long, non-digit
 * junk, and non-string types.
 * Does NOT change normalizePhone behavior — callers that compare via
 * normalizePhone are unaffected.
 */
export function isValidPhone(raw: unknown): boolean {
  if (typeof raw !== 'string') return false;
  const normalized = normalizePhone(raw);
  // Optional '+', then exactly 7–15 digits, nothing else.
  return /^\+?\d{7,15}$/.test(normalized);
}
