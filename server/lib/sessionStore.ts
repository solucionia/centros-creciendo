/**
 * Factory for a persistent SQLite-backed express-session store.
 *
 * Why SQLite? Low-volume, single-instance deployment — no external service
 * needed, sessions survive server restarts, and the DB is a plain file.
 *
 * Usage:
 *   import session from 'express-session';
 *   import { createSessionStore } from './lib/sessionStore';
 *
 *   app.use(session({ store: createSessionStore(session), ... }));
 *
 * Configuration (all optional, resolved in this order):
 *   opts.dbPath                → explicit override
 *   process.env.SESSION_DB_PATH → env var fallback
 *   ./data/sessions.db         → built-in default (relative to cwd)
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import session from 'express-session';

// better-sqlite3-session-store ships CommonJS; import via createRequire so the
// ESM host (package.json "type": "module") can consume it without issues.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const SqliteStoreFactory = require('better-sqlite3-session-store');

const DEFAULT_DB_PATH = './data/sessions.db';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface SessionStoreOptions {
  /** Path to the SQLite database file (absolute or relative to cwd). */
  dbPath?: string;
}

/**
 * Creates and returns a persistent SQLite session store.
 *
 * The function:
 *  1. Resolves the DB file path (opts.dbPath → SESSION_DB_PATH env → default).
 *  2. Creates the parent directory tree if it does not exist.
 *  3. Opens the SQLite database.
 *  4. Returns a new SqliteStore bound to that database.
 *
 * Safe to construct multiple times against the same file — the underlying
 * CREATE TABLE uses IF NOT EXISTS.
 */
export function createSessionStore(
  sessionLib: typeof session,
  opts?: SessionStoreOptions,
): session.Store {
  const dbPath = opts?.dbPath ?? process.env.SESSION_DB_PATH ?? DEFAULT_DB_PATH;
  const resolvedPath = path.resolve(dbPath);
  const dir = path.dirname(resolvedPath);

  // Create parent directory recursively if it does not exist.
  fs.mkdirSync(dir, { recursive: true });

  const client = new Database(resolvedPath);

  const SqliteStore = SqliteStoreFactory({ Store: sessionLib.Store });

  return new SqliteStore({
    client,
    expired: {
      clear: true,
      intervalMs: ONE_DAY_MS,
    },
  });
}
