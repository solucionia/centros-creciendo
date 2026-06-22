/**
 * Resolves the Express "trust proxy" setting from the TRUST_PROXY environment
 * variable. Extracted as a pure helper so it can be unit-tested without booting
 * the server.
 *
 * Accepted values (case-sensitive):
 *   - Unset or empty → false (safe default — do NOT trust X-Forwarded-For)
 *   - "true"         → true
 *   - "false"        → false
 *   - A numeric string (e.g. "1") → the number (hop count)
 *   - Any other string (e.g. "loopback", a CIDR) → passed through as-is
 *
 * In production deployments behind a proxy, set TRUST_PROXY=1 (or the
 * appropriate hop count / CIDR) via environment variable or Replit secret.
 */
export function resolveTrustProxy(env: string | undefined): number | boolean | string {
  if (!env) return false;
  if (env === 'true') return true;
  if (env === 'false') return false;
  const asNumber = Number(env);
  if (!Number.isNaN(asNumber) && String(asNumber) === env) return asNumber;
  return env;
}

/**
 * Returns true when the app is running in production without TRUST_PROXY set,
 * which means req.ip will reflect the proxy IP rather than the real client IP,
 * making IP-based rate limiting ineffective behind a reverse proxy.
 * Pure function — no side effects; call it to decide whether to emit a warning.
 */
export function shouldWarnTrustProxy(
  nodeEnv: string | undefined,
  trustProxyEnv: string | undefined,
): boolean {
  return nodeEnv === 'production' && !resolveTrustProxy(trustProxyEnv);
}
