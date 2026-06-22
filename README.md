# Centro Creciendo — Appointment Booking (CitaFácil)

Medical appointment booking app for **Centro Creciendo** (pediatrics and adult
care). Patients authenticate with a **WhatsApp OTP login** (via GoHighLevel /
LeadConnector) and the whole app sits behind that authentication. Availability,
doctors and appointments are backed by the **DriCloud** practice-management API,
with a demo-mode fallback when the DriCloud subscription is inactive.

## Tech stack

- **Frontend:** React 18 + Vite, Wouter (routing), TanStack Query, Tailwind CSS,
  shadcn/ui (Radix), `input-otp`.
- **Backend:** Express 4 + TypeScript (ESM), `express-session` with a persistent
  SQLite store (`better-sqlite3`).
- **Integrations:** GoHighLevel/LeadConnector (OTP delivery over WhatsApp),
  DriCloud WebAPI (patients, doctors, availability, appointments).
- **Tooling:** `tsx`, `esbuild`, `drizzle-kit`, Vitest + supertest.

## Getting started

> The project originally ran on Replit. It now runs on Windows/macOS/Linux.

```bash
# 1. Install dependencies
npm install

# 2. Create your local environment file from the template
cp env.example .env        # then fill in the values (see "Environment")

# 3. Run the dev server (client + API on the same port)
npm run dev
```

The server listens on `http://localhost:5000` by default (`PORT` overrides it).

### Environment

Copy [`env.example`](./env.example) to `.env` and fill in the values. **Never
commit `.env`** — it is gitignored.

| Variable | Purpose |
| --- | --- |
| `CRM_API_KEY` | GoHighLevel private integration key (read/write Contacts) |
| `CRM_LOCATION_ID` | Clinic location ID in the CRM |
| `CRM_BASE_URL` | LeadConnector API base URL |
| `OTP_EXPIRY_SECONDS` / `OTP_MAX_ATTEMPTS` | OTP lifetime and attempt limit |
| `SESSION_SECRET` | Session cookie signing secret (**required in production**) |
| `DRICLOUD_URL_CLINICA` / `DRICLOUD_CLINICA_ID` / `DRICLOUD_API_PASSWORD` | DriCloud WebAPI credentials |

`SESSION_SECRET` is mandatory in production — the server throws on startup if it
is missing. In development a local fallback is used so you can run without it.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start the dev server (Vite middleware + API) |
| `npm run build` | Build client and bundle the server |
| `npm start` | Run the production build |
| `npm run check` | Type-check with `tsc` |
| `npm test` | Run the test suite once (Vitest) |
| `npm run test:watch` | Run tests in watch mode |

`dev`/`start` use `cross-env` so `NODE_ENV` works on Windows shells too.

## Authentication flow (WhatsApp OTP)

1. `POST /api/auth/request-otp` — looks up (or creates) the contact in
   GoHighLevel by phone, generates an OTP and pushes it via the CRM custom
   field that triggers the WhatsApp message. Rate-limited per phone+IP.
2. `POST /api/auth/verify-otp` — validates the code, regenerates the session
   (anti session-fixation) and stores the authenticated user. Rate-limited.
3. `GET /api/auth/me` — current session state.
4. `POST /api/auth/logout` — destroys the session.

All booking/patient endpoints require an authenticated session (`requireAuth`).

## Project structure

```
client/            React app (Vite root)
  src/pages         Login, Home, ...
  src/hooks         use-auth, use-dricloud, ...
  src/components     UI + booking components
server/
  app.ts            createApp() — express + session + routes (no listen)
  index.ts          entrypoint: dotenv, Vite/static, listen
  routes.ts         doctors + (local) appointments routes
  routes/           auth.routes.ts, dricloud.routes.ts
  lib/              shared helpers (normalizePhone)
  services/         crmService, otpService (GoHighLevel OTP)
  dricloud/         DriCloud auth, services, mappers, mock data
shared/             shared Zod schema / types
```

## Testing

Tests live next to the server code as `*.test.ts` and run on Vitest with
supertest for HTTP-level checks:

```bash
npm test
```

## Security

A security triage of the OTP login is tracked in
[`docs/SECURITY.md`](./docs/SECURITY.md). All **P0** findings — including both
IDOR vulnerabilities that exposed third-party patient data — are remediated and
covered by integration tests. Remaining hardening items (P1 / P2) are listed
there.
