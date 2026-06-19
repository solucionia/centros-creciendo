import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
// @ts-ignore — memorystore no publica tipos propios
import createMemoryStore from "memorystore";
import type { Server } from "http";
import { registerRoutes } from "./routes";
import { log } from "./vite";

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
export async function createApp(): Promise<{ app: express.Express; server: Server }> {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // ─── Sesión (express-session + memorystore) ───────────────────────────────
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction) {
    // Necesario para que la cookie 'secure' funcione detrás del proxy (Replit).
    app.set("trust proxy", 1);
  }
  const MemoryStoreSession = createMemoryStore(session);
  app.use(
    session({
      name: "connect.sid",
      secret: resolveSessionSecret(process.env.NODE_ENV, process.env.SESSION_SECRET),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      store: new MemoryStoreSession({ checkPeriod: 24 * 60 * 60 * 1000 }),
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
          logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
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
