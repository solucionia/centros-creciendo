# Design — GHL ↔ DriCloud Appointments Middleware

**Date:** 2026-06-25
**Source spec:** `middleware-citas-especificacion.md` (client requirements, v1.0)
**Status:** Design — pending user review

## 1. Overview

A REST middleware that bridges the GoHighLevel (GHL) CRM conversational bot and
DriCloud (the clinic's practice-management system). When a patient asks for an
appointment through any GHL channel (SMS / WhatsApp / Web Chat), the bot calls
this middleware to verify-or-create the patient, list available slots, book the
chosen slot, and optionally cancel.

The middleware is a thin translation + auth layer over the DriCloud integration
that already exists in `server/dricloud/services.ts`. It does not re-implement
DriCloud access; it adapts the client-facing contract (Spanish fields, E.164
phones, `YYYY-MM-DD` / `HH:MM`, opaque `slot_id`) to the existing DriCloud
functions and back.

## 2. Decisions (locked during brainstorming)

1. **Location:** lives inside the existing Express app, isolated under
   `server/middleware/`, mounted at prefix **`/api/ghl`**. Reuses
   `server/dricloud/services.ts`. No separate service, no duplication.
2. **`slot_id`:** stateless, HMAC-signed token (no server state, survives
   restarts and multiple instances).
3. **Scope:** all four endpoints (verify-or-create, slots, reserve, cancel).
4. **Defaults accepted:** API key via env var; `crm_calendar_id` always `null`
   (GHL owns its calendar); reminders out of scope (GHL workflows); specialty
   text → `ESP_ID` resolved dynamically via `getEspecialidades`.
5. **`NO_SLOTS`** returns HTTP `200` with `success: false` ("no availability" is
   a valid search result, not a client error).

## 3. Architecture

```
GHL Conversation Bot
      │  HTTPS + X-API-Key + X-CRM-Location
      ▼
/api/ghl/*  (Express router, this middleware)
   ├── apiKeyAuth            (gate every request)
   ├── ghl.routes.ts         (4 handlers)
   ├── slotToken.ts          (encode/decode signed slot_id)
   ├── ghlMappers.ts         (contract ↔ DriCloud types)
   └── ghlError.ts           (uniform error envelope + HTTP map)
      │  function calls
      ▼
server/dricloud/services.ts  (existing, reused)
      │
      ▼
DriCloud API (apidricloud.dricloud.net, idClinica 20423)
```

All files live under `server/middleware/`. The router is registered in
`server/routes.ts` next to the existing `registerDriCloudRoutes(app)`.

## 4. Components (isolated units)

### 4.1 `apiKeyAuth` (middleware)
- Reads `X-API-Key`; compares against `process.env.GHL_MIDDLEWARE_API_KEY`
  using a constant-time comparison. Missing/mismatch → `401` with the standard
  error envelope (`codigo_error: "API_KEY_INVALIDA"`).
- If `process.env.GHL_LOCATION_ID` is set, also requires `X-CRM-Location` to
  match it; otherwise the header is accepted but ignored.
- Applied to all `/api/ghl/*` routes.

### 4.2 `slotToken.ts`
- `encodeSlot(payload): string` → `base64url(JSON(payload)) + "." + base64url(HMAC_SHA256(payload, GHL_MIDDLEWARE_SECRET))`.
- `decodeSlot(token): payload` → splits, recomputes HMAC, constant-time
  compares; throws `InvalidSlotError` if the signature fails or the format is
  malformed.
- Payload fields (compact keys to keep the token short):
  `{ u: USU_ID, f: "yyyy-MM-dd", h: "HH:mm", t: TCI_ID, d: DES_ID|null, m: minutos, esp: ESP_ID|null }`.
- No expiry embedded in v1 (DriCloud rejects an already-taken slot at reserve
  time, which surfaces as `SLOT_NO_DISPONIBLE`). An optional `exp` can be added
  later without breaking the format.

### 4.3 `ghlMappers.ts`
- Phone: normalize to E.164 (reuse `server/lib/phone.ts`).
- Date/time: DriCloud `yyyyMMddHHmm` ↔ spec `YYYY-MM-DD` + `HH:MM`. Reuses the
  naive-wall-clock helper from `server/dricloud/mapper.ts`
  (`naiveLocalStringToDateTimeForDriCloud`) so booking is timezone-safe.
- Patient: DriCloud `DriCloudPaciente` → spec `paciente` object.
- Doctor/specialty: `ESP_ID` ↔ specialty name via `getEspecialidades`
  (case/accent-insensitive name match; if no match, treat as "no specialty
  filter").
- Confirmation text: builds `mensaje_confirmacion` in natural Spanish from the
  booked slot (e.g. "Su cita ha sido confirmada para el viernes 27 de junio a
  las 09:00h con la Dra. Martínez (Pediatría).").

### 4.4 `ghlError.ts`
- `sendError(res, codigo_error, mensaje, { httpStatus, accion_sugerida })` →
  writes `{ success:false, codigo_error, mensaje, accion_sugerida? }`.
- Error → HTTP map: `DATOS_INCOMPLETOS`→400, `API_KEY_INVALIDA`→401,
  `PACIENTE_NO_ENCONTRADO`→404, `SLOT_NO_DISPONIBLE`→409, `NO_SLOTS`→200,
  `DRICLOUD_ERROR`→500.

### 4.5 `ghl.routes.ts` (the 4 handlers)

**POST `/api/ghl/paciente/verificar-o-crear`**
- Validate required fields (`telefono`, `nombre`, `apellidos`, `crm_contact_id`)
  → else `DATOS_INCOMPLETOS`.
- Lookup: `getPacientePorNombreTelefono` / `getPacientesPorTelefono` (phone is
  the primary key; email secondary).
- Found → `{ success:true, es_nuevo:false, paciente:{…} }` (include
  `ultima_visita` / `medico_habitual` only if DriCloud provides them).
- Not found → `createPaciente(...)` → `{ success:true, es_nuevo:true, paciente:{…} }`.
- DriCloud failure → `DRICLOUD_ERROR`.

**POST `/api/ghl/citas/slots-disponibles`**
- Validate `id_dricloud`, `crm_contact_id`, `fecha_desde`, `fecha_hasta`.
- Resolve target doctors:
  - `id_medico` set → just that doctor;
  - else `especialidad` set → resolve `ESP_ID` → `getDoctores(espId)`;
  - else → all real doctors.
- For each doctor: `getAgendaDisponibilidad({ usuId, fecha: fecha_desde,
  diasRecuperar: clamp(daysBetween(fecha_desde, fecha_hasta)+1, 1, 31) })`.
- `parseDisponibilidad` each entry → { date, minutes, desId }; filter to
  `[fecha_desde, fecha_hasta]` and by `preferencia_horaria`
  (mañana < 14:00, tarde ≥ 14:00, cualquiera = all).
- Build a signed `slot_id` per hueco; map to the response slot shape
  (`fecha`, `hora_inicio`, `hora_fin`, `medico`, `especialidad`, `consulta`).
- Cap at 10. Empty → `NO_SLOTS` (HTTP 200, `accion_sugerida: "ampliar_rango"`).

**POST `/api/ghl/citas/reservar`**
- Validate `id_dricloud`, `crm_contact_id`, `slot_id`.
- `decodeSlot(slot_id)` → throws → `DATOS_INCOMPLETOS` (tampered/invalid token).
- `createCita({ usuId, fechaInicioCitaString, pacId: id_dricloud, tciId, desId,
  cliId })`.
- DriCloud rejects the slot (already taken) → `SLOT_NO_DISPONIBLE` (409).
- Success → `{ success:true, cita:{ id_cita_dricloud, fecha, hora_inicio,
  hora_fin, medico, especialidad, consulta, localizacion, crm_calendar_id:null,
  mensaje_confirmacion } }`.

**POST `/api/ghl/citas/cancelar`**
- Validate `id_dricloud`, `id_cita_dricloud`, `crm_contact_id`.
- `getCitaById(id_cita_dricloud)` → 404 if missing.
- Ownership: the appointment's `PAC_ID` must equal `id_dricloud`; otherwise
  reject (do not cancel another patient's appointment).
- `deleteCita(...)` → `{ success:true, mensaje:"Cita cancelada correctamente. El
  hueco ha quedado libre." }`.

## 5. Data flow notes

- The middleware is stateless. The only data crossing requests is the signed
  `slot_id`, which carries everything `reservar` needs.
- Specialty resolution is dynamic (no hardcoded `ESP_ID` table) to survive
  clinic configuration changes.

## 6. Security / RGPD

- HTTPS in production (deployment concern; TLS terminated upstream).
- `X-API-Key` validated on every request (constant-time compare).
- Optional IP allowlist is a deployment/infra concern, noted but not in app code
  for v1.
- Reuse the existing PII-safe logger (the response logger was fixed under issue
  #5 to not leak phones). No patient PII in logs without masking.
- Secrets (`GHL_MIDDLEWARE_API_KEY`, `GHL_MIDDLEWARE_SECRET`, optional
  `GHL_LOCATION_ID`) only via environment, never committed.

## 7. Testing strategy (strict TDD)

Unit/route tests with vitest + supertest, mocking `server/dricloud/services.ts`
(no live DriCloud calls). Cases:
- `apiKeyAuth`: 401 when header missing/wrong; pass when correct.
- `slotToken`: encode→decode round-trip; tampered payload/signature rejected.
- verify-or-create: existing patient, new patient, missing required fields
  (`DATOS_INCOMPLETOS`), DriCloud failure (`DRICLOUD_ERROR`).
- slots: happy path with signed `slot_id`s, specialty filter, `preferencia_horaria`
  filter, empty → `NO_SLOTS`, 10-item cap.
- reserve: happy path, invalid/tampered `slot_id` → 400, slot taken → 409.
- cancel: happy path, ownership mismatch rejected, missing appointment → 404.

**End-to-end against real DriCloud availability is NOT possible yet** — the
current account (`centrocreciendo`, idClinica 20423) is a sandbox with no
published agenda (verified: `GetAgendaDisponibilidad` returns 0 for every
parameter combination, `GetDespachos` is empty). Real e2e validation requires a
production DriCloud account. Tracked in issue #14.

## 8. Out of scope (v1)

- GHL calendar sync (`crm_calendar_id` stays `null`).
- 24h reminders (handled by GHL workflows).
- IP allowlist enforcement in app code (infra concern).
- `slot_id` expiry (DriCloud rejects stale slots at reserve time).

## 9. Open items inherited from spec §8 (need client/ops input, not blocking dev)

- Public base URL for the middleware.
- Agreed `X-API-Key` value.
- Canonical list of specialties (we resolve dynamically, so not a blocker).
- DriCloud production credentials (idClinica/user/password/salt) — blocker for
  real e2e, not for development against mocks.

## 10. Delivery

New feature, independent of PR #12 (booking). Implemented on its own branch with
TDD. Branch strategy and whether to merge PR #12 first (so the middleware
branches from a main that already has the timezone fix it reuses) to be decided
at implementation time.
