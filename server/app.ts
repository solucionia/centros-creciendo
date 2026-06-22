import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import helmet from "helmet";
import { createSessionStore } from "./lib/sessionStore";
import type { Server } from "http";
import { registerRoutes } from "./routes";
import { log } from "./vite";
import { resolveTrustProxy, shouldWarnTrustProxy } from "./lib/trustProxy";

const DEV_FALLBACK_SESSION_SECRET = "dev-insecure-secret-change-me";

/**
 * Resolves the session signing secret. In production a real SESSION_SECRET is
 * mandatory — without it, sessions would be signed with a public, source-visible
 * value, letting anyone forge auth cookies. Outside production we allow a dev
 * fallback so local runs and tests don't need the env var.
 */
export function resolveSessionSecret(
  nodeEnv: string | undefined,
  secret: string | undefined,
): string {
  if (secret) {
    return secret;
  }
  if (nodeEnv === "production") {
    throw new Error("SESSION_SECRET must be set in production");
  }
  return DEV_FALLBACK_SESSION_SECRET;
}

/**
 * Builds the Express app with session support and all API routes registered,
 * but WITHOUT binding a port or wiring Vite. Extracted from index.ts so tests
 * can exercise the routes via supertest and the entrypoint stays thin.
 */
/**
 * Returns true when `key` names a PII field that must never appear in logs.
 * Matching is case-insensitive and pattern-based so it covers both local
 * camelCase fields (patientPhone, patientEmail, patientName) and DriCloud
 * ALL_CAPS fields (PAC_TELEFONO1, PAC_EMAIL, PAC_NOMBRE, PAC_NIF, etc.)
 * without requiring an exhaustive allowlist.
 */
export function isPiiKey(key: string): boolean {
  return (
    /phone/i.test(key) ||
    /telefono/i.test(key) ||
    /email/i.test(key) ||
    /correo/i.test(key) ||
    /nif/i.test(key) ||
    /pasaporte/i.test(key) ||
    /nombre/i.test(key) ||
    /apellido/i.test(key) ||
    /name/i.test(key) ||
    /password/i.test(key) ||
    /token/i.test(key) ||
    /secret/i.test(key) ||
    /otp/i.test(key) ||
    /nacimiento/i.test(key)
  );
}

/**
 * Returns a deep copy of `body` with PII fields replaced by "[REDACTED]".
 * Matching is case-insensitive and pattern-based (see isPiiKey). Arrays are
 * recursed element-by-element. Operates on a copy — never mutates the original.
 */
export function redactPii(body: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (isPiiKey(key)) {
      result[key] = '[REDACTED]';
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === 'object'
          ? redactPii(item as Record<string, unknown>)
          : item,
      );
    } else if (value !== null && typeof value === 'object') {
      result[key] = redactPii(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export async function createApp(): Promise<{ app: express.Express; server: Server }> {
  const app = express();

  // ─── Security headers (Helmet) ────────────────────────────────────────────
  // Content-Security-Policy is intentionally disabled here because this app
  // serves its own React SPA via Vite middleware (dev) and static files (prod),
  // both of which require inline scripts/styles and Vite HMR WebSockets.
  // TODO(P2): configure a tailored CSP that whitelists Vite's specific needs.
  app.use(helmet({ contentSecurityPolicy: false }));
  // Belt-and-suspenders: helmet already handles this via its own mechanism,
  // but the Express-level toggle ensures it stays off even if helmet is removed.
  app.disable('x-powered-by');

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // ─── Session (express-session + SQLite persistent store) ─────────────────
  const isProduction = process.env.NODE_ENV === "production";
  // TRUST_PROXY controls req.ip reliability and X-Forwarded-For trust.
  // Default is false (safe for no-proxy / local). Set TRUST_PROXY=1 in
  // production behind a reverse proxy (e.g. Replit, nginx, Cloudflare).
  if (shouldWarnTrustProxy(process.env.NODE_ENV, process.env.TRUST_PROXY)) {
    console.warn(
      '[app] WARNING: Running in production without TRUST_PROXY set. ' +
      'req.ip will reflect the proxy IP rather than the real client IP — ' +
      'IP-based rate limiting may be ineffective behind a reverse proxy. ' +
      'Set TRUST_PROXY=1 (or the appropriate hop count/CIDR) to fix this.',
    );
  }
  app.set("trust proxy", resolveTrustProxy(process.env.TRUST_PROXY));
  app.use(
    session({
      name: "connect.sid",
      secret: resolveSessionSecret(process.env.NODE_ENV, process.env.SESSION_SECRET),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: createSessionStore(session),
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        maxAge: 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, any> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      if (path.startsWith("/api")) {
        let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
        if (capturedJsonResponse) {
          // Redact PII (e.g. phone) before writing to the log. This prevents
          // sensitive user data from appearing in server logs or log aggregators.
          const safe = redactPii(capturedJsonResponse);
          logLine += ` :: ${JSON.stringify(safe)}`;
        }

        if (logLine.length > 80) {
          logLine = logLine.slice(0, 79) + "…";
        }

        log(logLine);
      }
    });

    next();
  });

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  return { app, server };
}
