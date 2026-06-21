/**
 * Normalizes a phone number string for consistent comparison.
 * Keeps the leading digit and '+' prefix; strips spaces, dashes, parens, dots.
 * Mirrors the implementation originally in auth.routes.ts — single source of truth.
 */
export function normalizePhone(raw: unknown): string {
  return String(raw ?? '').trim().replace(/[\s\-().]/g, '');
}
