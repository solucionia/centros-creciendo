/**
 * Unit tests for createSessionStore.
 *
 * Business goal: sessions must survive a server restart.
 * These tests verify the round-trip, cross-instance persistence, and directory
 * creation behaviour of the SQLite-backed session store factory.
 */

import { describe, it, expect, afterEach } from 'vitest';
import session from 'express-session';
import os from 'os';
import path from 'path';
import fs from 'fs';
import { createSessionStore } from './sessionStore';

// ── helpers ────────────────────────────────────────────────────────────────────

/** Wrap a store's callback-style set() in a Promise. */
function storeSet(
  store: session.Store,
  sid: string,
  data: session.SessionData,
): Promise<void> {
  return new Promise((resolve, reject) => {
    store.set(sid, data, (err) => (err ? reject(err) : resolve()));
  });
}

/** Wrap a store's callback-style get() in a Promise. */
function storeGet(
  store: session.Store,
  sid: string,
): Promise<session.SessionData | null> {
  return new Promise((resolve, reject) => {
    store.get(sid, (err, data) => (err ? reject(err) : resolve(data ?? null)));
  });
}

/** Minimal valid session data fixture. */
function makeSessionData(): session.SessionData {
  return {
    cookie: {
      originalMaxAge: 86400000,
      expires: new Date(Date.now() + 86400000),
      secure: false,
      httpOnly: true,
      path: '/',
    },
  };
}

// Track temp files/dirs created so we can clean them up.
const tempPaths: string[] = [];

function tempDbPath(suffix: string): string {
  const p = path.join(os.tmpdir(), `sessionStore-test-${suffix}.db`);
  tempPaths.push(p);
  return p;
}

afterEach(() => {
  for (const p of tempPaths.splice(0)) {
    try { fs.rmSync(p, { recursive: true, force: true }); } catch { /* already gone */ }
  }
});

// ── tests ──────────────────────────────────────────────────────────────────────

describe('createSessionStore', () => {
  // ── Test 1: round-trip ─────────────────────────────────────────────────────
  it('round-trip: set then get returns the same session data', async () => {
    const dbPath = tempDbPath('round-trip');
    const store = createSessionStore(session, { dbPath });
    const sid = 'test-sid-1';
    const data = makeSessionData();

    await storeSet(store, sid, data);
    const retrieved = await storeGet(store, sid);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.cookie?.httpOnly).toBe(true);
    expect(retrieved?.cookie?.path).toBe('/');
  });

  // ── Test 2: persistence across restart (new store instance, same file) ─────
  it('persistence across restart: a new store on the same file returns the session', async () => {
    const dbPath = tempDbPath('persist');
    const sid = 'test-sid-persist';
    const data = makeSessionData();

    // Store A — first "server instance"
    const storeA = createSessionStore(session, { dbPath });
    await storeSet(storeA, sid, data);

    // Store B — simulates a server restart (fresh store instance on same file)
    const storeB = createSessionStore(session, { dbPath });
    const retrieved = await storeGet(storeB, sid);

    expect(retrieved).not.toBeNull();
    expect(retrieved?.cookie?.path).toBe('/');
  });

  // ── Test 3: directory creation ─────────────────────────────────────────────
  it('directory creation: creates nested directories if they do not exist', async () => {
    const [sec, ns] = process.hrtime();
    const nestedRoot = path.join(os.tmpdir(), `sessionStore-test-nested-${sec}-${ns}`);
    const nestedDir = path.join(nestedRoot, 'deep', 'dir');
    const dbPath = path.join(nestedDir, 'sessions.db');
    tempPaths.push(nestedRoot); // cleanup the whole tree

    // Directory must NOT exist before the factory is called.
    expect(fs.existsSync(nestedDir)).toBe(false);

    const store = createSessionStore(session, { dbPath });

    // Directory was created by the factory.
    expect(fs.existsSync(nestedDir)).toBe(true);

    // Store works after directory creation.
    const sid = 'test-sid-dir';
    const data = makeSessionData();
    await storeSet(store, sid, data);
    const retrieved = await storeGet(store, sid);
    expect(retrieved).not.toBeNull();
  });
});
