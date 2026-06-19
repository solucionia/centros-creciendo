# Security Triage — WhatsApp OTP Login

This document tracks the security review of the OTP login and the state of each
finding. Severities were verified against the code. No secrets are included.

## Remediated

| ID | Severity | Finding | Fix |
| --- | --- | --- | --- |
| P0-c | High | `SESSION_SECRET` had a hardcoded fallback — if the env var were missing in production, sessions would be signed with a public, source-visible value (cookie forgery). | `resolveSessionSecret()` now throws on startup in production when the secret is missing; the dev fallback is dev/test only. Covered by tests. |
| P0-d | High | `POST /api/auth/verify-otp` had no network rate limit — enabling code brute-force and account-lockout DoS of a victim. | Per-phone+IP limiter (10 attempts / 15 min) returns `429`. Covered by tests. |

## Open — blocked on a data-model decision

Both IDORs depend on the same rule: the **login phone is the patient identity**,
and one phone maps to **several patients** (family case in pediatrics). Scoping
must therefore validate ownership (1:N) against the session phone.

| ID | Severity | Finding |
| --- | --- | --- |
| P0-a | High (IDOR) | `GET /api/appointments` requires auth but returns **all** appointments (no per-user scoping); `POST /api/appointments/:id/cancel` does not verify ownership. |
| P0-b | High (IDOR) | `GET /api/dricloud/patients?telefono=` and `GET /api/dricloud/appointments?nif=` trust a client-supplied identifier, exposing third-party patient data (PHI). Identifiers must be derived from the session server-side. |

## Open — hardening (P1)

| Finding | Location |
| --- | --- |
| `POST /api/doctors` has no `requireAuth` (anonymous writes to the in-memory store). | `server/routes.ts` |
| Response logger captures response bodies; `/api/auth/me` returns the phone → PII in logs. | `server/app.ts` |
| `/api/dricloud/diagnostico` and `/api/dricloud/refresh` are unauthenticated (leak internal URL, allow forced token reconnect). | `server/routes/dricloud.routes.ts` |
| No security headers (Helmet absent); `X-Powered-By` exposed. | `server/app.ts` |

## Open — improvements (P2)

- TOCTOU between contact lookup and creation in `request-otp` (possible duplicate CRM contact).
- `trust proxy` only enabled in production → `req.ip` may be unreliable for rate limiting in other setups.
- `normalizePhone` does not validate format/length before hitting the CRM.
- `memorystore` is single-process — sessions are lost on restart / not multi-instance safe.

## Dependency audit

`npm audit` reports vulnerabilities, mostly transitive in the **dev toolchain**
(esbuild/vite/tsx/drizzle-kit) and therefore low runtime risk. `drizzle-orm` is
the one runtime-relevant high; confirm whether SQL is actually used (current
storage is in-memory) before applying the breaking upgrade.

## Secrets hygiene

All credentials (CRM, DriCloud, session, external system) are read from
`process.env`. `.env` and Replit local state (`.local/`) are gitignored and must
never be committed. See [`env.example`](../env.example) for the required keys.
