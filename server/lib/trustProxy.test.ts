/**
 * Unit tests for resolveTrustProxy (P2 Item 2) and shouldWarnTrustProxy (SHOULD-FIX 3).
 * Tests the pure helpers that read TRUST_PROXY from the environment.
 */

import { describe, it, expect } from 'vitest';
import { resolveTrustProxy, shouldWarnTrustProxy } from './trustProxy';

describe('resolveTrustProxy', () => {
  // ── Safe default: unset env → do NOT trust proxy headers ─────────────────────

  it('returns false when TRUST_PROXY is not set (safe default)', () => {
    expect(resolveTrustProxy(undefined)).toBe(false);
  });

  it('returns false when TRUST_PROXY is empty string', () => {
    expect(resolveTrustProxy('')).toBe(false);
  });

  // ── Numeric hop count ─────────────────────────────────────────────────────────

  it('returns 1 (number) when TRUST_PROXY="1"', () => {
    expect(resolveTrustProxy('1')).toBe(1);
  });

  it('returns 2 (number) when TRUST_PROXY="2"', () => {
    expect(resolveTrustProxy('2')).toBe(2);
  });

  it('returns 0 (number) when TRUST_PROXY="0"', () => {
    expect(resolveTrustProxy('0')).toBe(0);
  });

  // ── Boolean strings ───────────────────────────────────────────────────────────

  it('returns true (boolean) when TRUST_PROXY="true"', () => {
    expect(resolveTrustProxy('true')).toBe(true);
  });

  it('returns false (boolean) when TRUST_PROXY="false"', () => {
    expect(resolveTrustProxy('false')).toBe(false);
  });

  // ── Arbitrary string pass-through (e.g. CIDR, loopback) ──────────────────────

  it('returns the string as-is when TRUST_PROXY is a non-numeric, non-boolean string', () => {
    expect(resolveTrustProxy('loopback')).toBe('loopback');
  });

  it('returns the string as-is for a CIDR value', () => {
    expect(resolveTrustProxy('127.0.0.1')).toBe('127.0.0.1');
  });
});

// ── SHOULD-FIX 3: shouldWarnTrustProxy — production without TRUST_PROXY ──────
//
// Pure helper: returns true when NODE_ENV is "production" and TRUST_PROXY is
// falsy (unset or empty), signalling that a startup warning should be emitted.

describe('shouldWarnTrustProxy', () => {
  it('returns true when NODE_ENV=production and TRUST_PROXY is undefined', () => {
    // RED against current implementation (function does not exist yet)
    expect(shouldWarnTrustProxy('production', undefined)).toBe(true);
  });

  it('returns true when NODE_ENV=production and TRUST_PROXY is empty string', () => {
    expect(shouldWarnTrustProxy('production', '')).toBe(true);
  });

  it('returns false when NODE_ENV=production and TRUST_PROXY=1', () => {
    expect(shouldWarnTrustProxy('production', '1')).toBe(false);
  });

  it('returns false when NODE_ENV=production and TRUST_PROXY=true', () => {
    expect(shouldWarnTrustProxy('production', 'true')).toBe(false);
  });

  it('returns false when NODE_ENV=development and TRUST_PROXY is undefined', () => {
    // Warning is only relevant in production
    expect(shouldWarnTrustProxy('development', undefined)).toBe(false);
  });

  it('returns false when NODE_ENV is undefined and TRUST_PROXY is undefined', () => {
    expect(shouldWarnTrustProxy(undefined, undefined)).toBe(false);
  });
});
