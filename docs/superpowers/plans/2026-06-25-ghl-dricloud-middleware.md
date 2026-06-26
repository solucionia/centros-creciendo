# GHL ↔ DriCloud Middleware Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stateless REST middleware at `/api/ghl` that lets a GoHighLevel CRM bot verify-or-create patients, list available slots, book, and cancel appointments against the clinic's existing DriCloud integration.

**Architecture:** An Express router registered in `server/routes.ts` alongside `registerDriCloudRoutes`; all handlers live in `server/middleware/ghl.routes.ts` and delegate exclusively to `server/dricloud/services.ts` — no direct DriCloud HTTP calls from middleware code. Slot state is carried client-side as a compact HMAC-signed base64url token so the server remains stateless across instances.

**Tech Stack:** TypeScript, Express 4, vitest, supertest, Node `crypto` (HMAC-SHA256), existing `server/dricloud/services.ts` and `server/lib/phone.ts`.

## Global Constraints

- Strict TDD: write a failing test first; implement the minimal code to make it pass; commit.
- Test runner: `npm test` (vitest run). Test files must match `server/**/*.test.ts`.
- Generated artifacts in English; user-facing API response strings in Spanish (per spec).
- Reuse `server/dricloud/services.ts` exclusively — never call DriCloud HTTP from middleware.
- Secrets only via environment variables: `GHL_MIDDLEWARE_API_KEY`, `GHL_MIDDLEWARE_SECRET`, optional `GHL_LOCATION_ID`. Never commit secret values.
- No PII (phone, name, email) in logs without masking; the existing `redactPii` in `server/app.ts` covers response logging automatically.
- Mock `server/dricloud/services.ts` in all route tests using `vi.mock('../dricloud/services', async (importOriginal) => { ... })` — the same pattern as `server/routes/idor.security.test.ts`.
- Build the Express app in tests via `createApp()` from `server/app.ts`; use `request(app)` (not a supertest agent) for stateless GHL routes since `apiKeyAuth` replaces session-based auth.
- `NO_SLOTS` is HTTP 200 with `success: false` (not an HTTP error status).
- `SLOT_NO_DISPONIBLE` is HTTP 409.

---

### Task 1: `ghlError.ts` — uniform error envelope

**Files:**
- Create: `server/middleware/ghlError.ts`
- Create: `server/middleware/ghlError.test.ts`

**Interfaces:**
- Consumes: `express.Response` (standard Express)
- Produces:
  ```ts
  type GhlErrorCode =
    | 'DATOS_INCOMPLETOS'
    | 'API_KEY_INVALIDA'
    | 'PACIENTE_NO_ENCONTRADO'
    | 'SLOT_NO_DISPONIBLE'
    | 'NO_SLOTS'
    | 'DRICLOUD_ERROR';

  function sendError(
    res: Response,
    codigo_error: GhlErrorCode,
    mensaje: string,
    opts?: { accion_sugerida?: string }
  ): void
  ```

---

- [ ] **Step 1.1: Write failing tests**

Create `server/middleware/ghlError.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { Response } from 'express';
import { sendError } from './ghlError';

function mockRes() {
  let statusCode = 200;
  let body: unknown;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    getStatus: () => statusCode,
    getBody: () => body,
  } as unknown as Response & { getStatus(): number; getBody(): unknown };
  return res;
}

describe('sendError', () => {
  it('DATOS_INCOMPLETOS → 400 with correct envelope', () => {
    const res = mockRes();
    sendError(res, 'DATOS_INCOMPLETOS', 'Falta telefono');
    expect(res.getStatus()).toBe(400);
    expect(res.getBody()).toEqual({
      success: false,
      codigo_error: 'DATOS_INCOMPLETOS',
      mensaje: 'Falta telefono',
    });
  });

  it('API_KEY_INVALIDA → 401', () => {
    const res = mockRes();
    sendError(res, 'API_KEY_INVALIDA', 'Clave incorrecta');
    expect(res.getStatus()).toBe(401);
    expect((res.getBody() as any).codigo_error).toBe('API_KEY_INVALIDA');
  });

  it('PACIENTE_NO_ENCONTRADO → 404', () => {
    const res = mockRes();
    sendError(res, 'PACIENTE_NO_ENCONTRADO', 'No existe');
    expect(res.getStatus()).toBe(404);
  });

  it('SLOT_NO_DISPONIBLE → 409', () => {
    const res = mockRes();
    sendError(res, 'SLOT_NO_DISPONIBLE', 'Ocupado');
    expect(res.getStatus()).toBe(409);
  });

  it('NO_SLOTS → 200 (not an HTTP error)', () => {
    const res = mockRes();
    sendError(res, 'NO_SLOTS', 'Sin disponibilidad', { accion_sugerida: 'ampliar_rango' });
    expect(res.getStatus()).toBe(200);
    expect((res.getBody() as any).accion_sugerida).toBe('ampliar_rango');
    expect((res.getBody() as any).success).toBe(false);
  });

  it('DRICLOUD_ERROR → 500', () => {
    const res = mockRes();
    sendError(res, 'DRICLOUD_ERROR', 'Error upstream');
    expect(res.getStatus()).toBe(500);
  });

  it('includes accion_sugerida only when provided', () => {
    const res = mockRes();
    sendError(res, 'DATOS_INCOMPLETOS', 'x');
    expect((res.getBody() as any).accion_sugerida).toBeUndefined();
  });
});
```

- [ ] **Step 1.2: Run test — expect FAIL**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A 3 "ghlError"
```

Expected: `Cannot find module './ghlError'`

- [ ] **Step 1.3: Implement `server/middleware/ghlError.ts`**

```ts
import type { Response } from 'express';

export type GhlErrorCode =
  | 'DATOS_INCOMPLETOS'
  | 'API_KEY_INVALIDA'
  | 'PACIENTE_NO_ENCONTRADO'
  | 'SLOT_NO_DISPONIBLE'
  | 'NO_SLOTS'
  | 'DRICLOUD_ERROR';

const HTTP_STATUS: Record<GhlErrorCode, number> = {
  DATOS_INCOMPLETOS: 400,
  API_KEY_INVALIDA: 401,
  PACIENTE_NO_ENCONTRADO: 404,
  SLOT_NO_DISPONIBLE: 409,
  NO_SLOTS: 200,
  DRICLOUD_ERROR: 500,
};

export function sendError(
  res: Response,
  codigo_error: GhlErrorCode,
  mensaje: string,
  opts?: { accion_sugerida?: string },
): void {
  const body: Record<string, unknown> = { success: false, codigo_error, mensaje };
  if (opts?.accion_sugerida) body.accion_sugerida = opts.accion_sugerida;
  res.status(HTTP_STATUS[codigo_error]).json(body);
}
```

- [ ] **Step 1.4: Run test — expect PASS**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "ghlError|PASS|FAIL"
```

Expected: all 7 tests in `ghlError.test.ts` → PASS.

- [ ] **Step 1.5: Commit**

```bash
git add server/middleware/ghlError.ts server/middleware/ghlError.test.ts
git commit -m "feat(ghl): add ghlError sendError with error→HTTP map"
```

---

### Task 2: `slotToken.ts` — HMAC-signed slot token

**Files:**
- Create: `server/middleware/slotToken.ts`
- Create: `server/middleware/slotToken.test.ts`

**Interfaces:**
- Consumes: Node `crypto` built-in (`createHmac`, `timingSafeEqual`)
- Produces:
  ```ts
  interface SlotPayload {
    u: number;          // USU_ID (doctor)
    f: string;          // "yyyy-MM-dd"
    h: string;          // "HH:mm"
    t: number;          // TCI_ID (appointment type)
    d: number | null;   // DES_ID (room), or null
    m: number;          // duration in minutes
    esp: number | null; // ESP_ID (specialty), or null
  }

  class InvalidSlotError extends Error {}

  function encodeSlot(payload: SlotPayload): string
  function decodeSlot(token: string): SlotPayload
  ```

---

- [ ] **Step 2.1: Write failing tests**

Create `server/middleware/slotToken.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encodeSlot, decodeSlot, InvalidSlotError, type SlotPayload } from './slotToken';

const SECRET = 'test-secret-32-chars-minimum-ok!';

const samplePayload: SlotPayload = {
  u: 42,
  f: '2026-07-10',
  h: '09:00',
  t: 7,
  d: 3,
  m: 30,
  esp: 5,
};

beforeEach(() => {
  process.env.GHL_MIDDLEWARE_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.GHL_MIDDLEWARE_SECRET;
});

describe('encodeSlot / decodeSlot', () => {
  it('round-trips a payload without mutation', () => {
    const token = encodeSlot(samplePayload);
    const decoded = decodeSlot(token);
    expect(decoded).toEqual(samplePayload);
  });

  it('produces a string with exactly one "." separator', () => {
    const token = encodeSlot(samplePayload);
    expect(token.split('.').length).toBe(2);
  });

  it('token contains only base64url-safe chars (A-Za-z0-9_-.)', () => {
    const token = encodeSlot(samplePayload);
    expect(token).toMatch(/^[A-Za-z0-9_\-\.]+$/);
  });

  it('handles null fields (d: null, esp: null)', () => {
    const p: SlotPayload = { ...samplePayload, d: null, esp: null };
    expect(decodeSlot(encodeSlot(p))).toEqual(p);
  });

  it('throws InvalidSlotError for a tampered payload segment', () => {
    const token = encodeSlot(samplePayload);
    const [, sig] = token.split('.');
    const fakePayload = Buffer.from(JSON.stringify({ ...samplePayload, u: 9999 })).toString('base64url');
    expect(() => decodeSlot(`${fakePayload}.${sig}`)).toThrow(InvalidSlotError);
  });

  it('throws InvalidSlotError for a tampered signature segment', () => {
    const token = encodeSlot(samplePayload);
    const [payload] = token.split('.');
    expect(() => decodeSlot(`${payload}.invalidsig`)).toThrow(InvalidSlotError);
  });

  it('throws InvalidSlotError for a token with no "." separator', () => {
    expect(() => decodeSlot('nodottoken')).toThrow(InvalidSlotError);
  });

  it('throws InvalidSlotError for an empty string', () => {
    expect(() => decodeSlot('')).toThrow(InvalidSlotError);
  });

  it('throws when GHL_MIDDLEWARE_SECRET is absent', () => {
    delete process.env.GHL_MIDDLEWARE_SECRET;
    expect(() => encodeSlot(samplePayload)).toThrow(/GHL_MIDDLEWARE_SECRET/);
  });
});
```

- [ ] **Step 2.2: Run test — expect FAIL**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A 3 "slotToken"
```

Expected: `Cannot find module './slotToken'`

- [ ] **Step 2.3: Implement `server/middleware/slotToken.ts`**

```ts
import { createHmac, timingSafeEqual } from 'crypto';

export interface SlotPayload {
  u: number;
  f: string;
  h: string;
  t: number;
  d: number | null;
  m: number;
  esp: number | null;
}

export class InvalidSlotError extends Error {
  constructor(reason: string) {
    super(`Invalid slot token: ${reason}`);
    this.name = 'InvalidSlotError';
  }
}

function getSecret(): string {
  const s = process.env.GHL_MIDDLEWARE_SECRET;
  if (!s) throw new Error('GHL_MIDDLEWARE_SECRET environment variable is not set');
  return s;
}

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function encodeSlot(payload: SlotPayload): string {
  const secret = getSecret();
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = hmac(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

export function decodeSlot(token: string): SlotPayload {
  const secret = getSecret();
  const dotIndex = token.indexOf('.');
  if (dotIndex <= 0 || dotIndex === token.length - 1) {
    throw new InvalidSlotError('malformed token — no valid "." separator');
  }
  const payloadB64 = token.slice(0, dotIndex);
  const receivedSig = token.slice(dotIndex + 1);

  const expectedSig = hmac(secret, payloadB64);

  // Constant-time comparison to prevent timing attacks.
  const expectedBuf = Buffer.from(expectedSig);
  const receivedBuf = Buffer.from(receivedSig);
  const same =
    expectedBuf.length === receivedBuf.length &&
    timingSafeEqual(expectedBuf, receivedBuf);

  if (!same) throw new InvalidSlotError('signature mismatch');

  let payload: SlotPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidSlotError('payload is not valid JSON');
  }
  return payload;
}
```

- [ ] **Step 2.4: Run test — expect PASS**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "slotToken|PASS|FAIL"
```

Expected: all 9 tests in `slotToken.test.ts` → PASS.

- [ ] **Step 2.5: Commit**

```bash
git add server/middleware/slotToken.ts server/middleware/slotToken.test.ts
git commit -m "feat(ghl): add slotToken HMAC-signed encode/decode"
```

---

### Task 3: `apiKeyAuth.ts` — Express authentication middleware

**Files:**
- Create: `server/middleware/apiKeyAuth.ts`
- Create: `server/middleware/apiKeyAuth.test.ts`

**Interfaces:**
- Consumes:
  - `sendError` from `./ghlError` (produced by Task 1)
  - `process.env.GHL_MIDDLEWARE_API_KEY` (required string)
  - `process.env.GHL_LOCATION_ID` (optional string)
- Produces:
  ```ts
  function apiKeyAuth(req: Request, res: Response, next: NextFunction): void
  ```

---

- [ ] **Step 3.1: Write failing tests**

Create `server/middleware/apiKeyAuth.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { apiKeyAuth } from './apiKeyAuth';

const API_KEY = 'test-api-key-1234';

function buildApp(locationId?: string) {
  process.env.GHL_MIDDLEWARE_API_KEY = API_KEY;
  if (locationId) {
    process.env.GHL_LOCATION_ID = locationId;
  } else {
    delete process.env.GHL_LOCATION_ID;
  }
  const app = express();
  app.use(express.json());
  app.get('/test', apiKeyAuth, (_req, res) => res.json({ ok: true }));
  return app;
}

beforeEach(() => {
  process.env.GHL_MIDDLEWARE_API_KEY = API_KEY;
  delete process.env.GHL_LOCATION_ID;
});

afterEach(() => {
  delete process.env.GHL_MIDDLEWARE_API_KEY;
  delete process.env.GHL_LOCATION_ID;
});

describe('apiKeyAuth', () => {
  it('passes when X-API-Key matches', async () => {
    const app = buildApp();
    const res = await request(app).get('/test').set('X-API-Key', API_KEY);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('returns 401 when X-API-Key is missing', async () => {
    const app = buildApp();
    const res = await request(app).get('/test');
    expect(res.status).toBe(401);
    expect(res.body.codigo_error).toBe('API_KEY_INVALIDA');
    expect(res.body.success).toBe(false);
  });

  it('returns 401 when X-API-Key is wrong', async () => {
    const app = buildApp();
    const res = await request(app).get('/test').set('X-API-Key', 'wrong-key');
    expect(res.status).toBe(401);
    expect(res.body.codigo_error).toBe('API_KEY_INVALIDA');
  });

  it('passes when GHL_LOCATION_ID matches X-CRM-Location', async () => {
    const app = buildApp('loc-abc');
    const res = await request(app)
      .get('/test')
      .set('X-API-Key', API_KEY)
      .set('X-CRM-Location', 'loc-abc');
    expect(res.status).toBe(200);
  });

  it('returns 401 when GHL_LOCATION_ID is set but X-CRM-Location is missing', async () => {
    const app = buildApp('loc-abc');
    const res = await request(app).get('/test').set('X-API-Key', API_KEY);
    expect(res.status).toBe(401);
    expect(res.body.codigo_error).toBe('API_KEY_INVALIDA');
  });

  it('returns 401 when GHL_LOCATION_ID is set but X-CRM-Location mismatches', async () => {
    const app = buildApp('loc-abc');
    const res = await request(app)
      .get('/test')
      .set('X-API-Key', API_KEY)
      .set('X-CRM-Location', 'loc-wrong');
    expect(res.status).toBe(401);
  });

  it('ignores X-CRM-Location when GHL_LOCATION_ID is not set', async () => {
    const app = buildApp(); // no GHL_LOCATION_ID
    const res = await request(app)
      .get('/test')
      .set('X-API-Key', API_KEY)
      .set('X-CRM-Location', 'any-value-is-fine');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 3.2: Run test — expect FAIL**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A 3 "apiKeyAuth"
```

Expected: `Cannot find module './apiKeyAuth'`

- [ ] **Step 3.3: Implement `server/middleware/apiKeyAuth.ts`**

```ts
import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { sendError } from './ghlError';

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Run a dummy comparison so execution time does not leak length info.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const expectedKey = process.env.GHL_MIDDLEWARE_API_KEY ?? '';
  const receivedKey = (req.headers['x-api-key'] as string) ?? '';

  if (!expectedKey || !safeEqual(receivedKey, expectedKey)) {
    sendError(res, 'API_KEY_INVALIDA', 'API key inválida o ausente.');
    return;
  }

  const expectedLocation = process.env.GHL_LOCATION_ID;
  if (expectedLocation) {
    const receivedLocation = (req.headers['x-crm-location'] as string) ?? '';
    if (!safeEqual(receivedLocation, expectedLocation)) {
      sendError(res, 'API_KEY_INVALIDA', 'X-CRM-Location no coincide con la ubicación configurada.');
      return;
    }
  }

  next();
}
```

- [ ] **Step 3.4: Run test — expect PASS**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "apiKeyAuth|PASS|FAIL"
```

Expected: all 7 tests in `apiKeyAuth.test.ts` → PASS.

- [ ] **Step 3.5: Commit**

```bash
git add server/middleware/apiKeyAuth.ts server/middleware/apiKeyAuth.test.ts
git commit -m "feat(ghl): add apiKeyAuth constant-time API key middleware"
```

---

### Task 4: `ghlMappers.ts` — contract ↔ DriCloud translation

**Files:**
- Create: `server/middleware/ghlMappers.ts`
- Create: `server/middleware/ghlMappers.test.ts`

**Interfaces:**
- Consumes:
  - `normalizePhone(raw: unknown): string` from `../lib/phone`
  - `naiveLocalStringToDateTimeForDriCloud(s: string): string` from `../dricloud/mapper`
  - `parseDisponibilidad(s: string): { date: Date; minutes: number; desId: number }` from `../dricloud/mapper`
  - `DriCloudDoctor`, `DriCloudEspecialidad`, `DriCloudPaciente` from `../dricloud/services`
- Produces:
  ```ts
  interface GhlPacienteResponse {
    pac_id: number;
    nombre: string;
    apellidos: string;
    telefono: string;
    email?: string;
  }

  interface GhlSlot {
    fecha: string;         // "yyyy-MM-dd"
    hora_inicio: string;   // "HH:mm"
    hora_fin: string;      // "HH:mm"
    medico: string;        // "USU_NOMBRE USU_APELLIDOS"
    especialidad: string | null;
    consulta: number | null; // DES_ID
  }

  function mapPacienteToResponse(p: DriCloudPaciente): GhlPacienteResponse
  function buildPacienteCreate(nombre: string, apellidos: string, telefono: string): Omit<DriCloudPaciente, 'PAC_ID'>
  function resolveEspId(especialidadName: string, especialidades: DriCloudEspecialidad[]): number | null
  function slotToGhlShape(rawDisp: string, doctor: DriCloudDoctor, espNombre: string | null): GhlSlot
  function buildConfirmacionMessage(slot: GhlSlot, doctorFullName: string): string
  function naiveDateTimeFromSlot(fecha: string, hora: string): string
  ```

---

- [ ] **Step 4.1: Write failing tests**

Create `server/middleware/ghlMappers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  mapPacienteToResponse,
  buildPacienteCreate,
  resolveEspId,
  slotToGhlShape,
  buildConfirmacionMessage,
  naiveDateTimeFromSlot,
} from './ghlMappers';
import type { DriCloudDoctor, DriCloudEspecialidad, DriCloudPaciente } from '../dricloud/services';

const samplePaciente: DriCloudPaciente = {
  PAC_ID: 10,
  PAC_NOMBRE: 'Laura',
  PAC_APELLIDOS: 'García López',
  PAC_TELEFONO1: '+34600111222',
  PAC_FECHA_NACIMIENTO: '19900101',
  PAC_SEXO_ID: 1,
  PAC_EMAIL: 'laura@example.com',
};

const sampleDoctor: DriCloudDoctor = {
  USU_ID: 5,
  USU_NOMBRE: 'Ana',
  USU_APELLIDOS: 'Martínez',
  USU_EMAIL: 'ana@clinic.com',
  ListadoESPECIALIDAD: [{ ESP_ID: 5 }],
};

describe('mapPacienteToResponse', () => {
  it('maps all fields', () => {
    const r = mapPacienteToResponse(samplePaciente);
    expect(r.pac_id).toBe(10);
    expect(r.nombre).toBe('Laura');
    expect(r.apellidos).toBe('García López');
    expect(r.telefono).toBe('+34600111222');
    expect(r.email).toBe('laura@example.com');
  });

  it('omits email when absent', () => {
    const p: DriCloudPaciente = { ...samplePaciente, PAC_EMAIL: undefined };
    expect(mapPacienteToResponse(p).email).toBeUndefined();
  });
});

describe('buildPacienteCreate', () => {
  it('normalizes phone to E.164 (00 prefix → +)', () => {
    const r = buildPacienteCreate('María', 'Pérez', '0034600111222');
    expect(r.PAC_TELEFONO1).toBe('+34600111222');
  });

  it('sets PAC_SEXO_ID to 0 (undetermined)', () => {
    const r = buildPacienteCreate('X', 'Y', '+34600000000');
    expect(r.PAC_SEXO_ID).toBe(0);
  });

  it('includes nombre and apellidos verbatim', () => {
    const r = buildPacienteCreate('Pedro', 'Ruiz Díaz', '+34600000000');
    expect(r.PAC_NOMBRE).toBe('Pedro');
    expect(r.PAC_APELLIDOS).toBe('Ruiz Díaz');
  });
});

describe('resolveEspId', () => {
  const especialidades: DriCloudEspecialidad[] = [
    { ESP_ID: 5, ESP_NOMBRE: 'Pediatría', ListadoTIPO_CITA: [] },
    { ESP_ID: 4, ESP_NOMBRE: 'Ginecología', ListadoTIPO_CITA: [] },
  ];

  it('matches case-insensitively', () => {
    expect(resolveEspId('pediatría', especialidades)).toBe(5);
    expect(resolveEspId('PEDIATRÍA', especialidades)).toBe(5);
  });

  it('matches accent-insensitively (pediatria → Pediatría)', () => {
    expect(resolveEspId('pediatria', especialidades)).toBe(5);
    expect(resolveEspId('ginecologia', especialidades)).toBe(4);
  });

  it('returns null when no match', () => {
    expect(resolveEspId('Dermatología', especialidades)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveEspId('', especialidades)).toBeNull();
  });
});

describe('slotToGhlShape', () => {
  it('maps raw disp string to GhlSlot shape', () => {
    // rawDisp format: "yyyyMMddHHmm:minutos:DES_ID"
    const raw = '202607100900:30:3';
    const slot = slotToGhlShape(raw, sampleDoctor, 'Pediatría');
    expect(slot.fecha).toBe('2026-07-10');
    expect(slot.hora_inicio).toBe('09:00');
    expect(slot.hora_fin).toBe('09:30');
    expect(slot.medico).toBe('Ana Martínez');
    expect(slot.especialidad).toBe('Pediatría');
    expect(slot.consulta).toBe(3);
  });

  it('handles null especialidad', () => {
    const slot = slotToGhlShape('202607100900:30:3', sampleDoctor, null);
    expect(slot.especialidad).toBeNull();
  });
});

describe('buildConfirmacionMessage', () => {
  it('contains hour and doctor name', () => {
    const slot = slotToGhlShape('202607100900:30:3', sampleDoctor, 'Pediatría');
    const msg = buildConfirmacionMessage(slot, 'Ana Martínez');
    expect(msg).toContain('09:00');
    expect(msg).toContain('Ana Martínez');
    expect(msg).toMatch(/cita|confirmada/i);
  });
});

describe('naiveDateTimeFromSlot', () => {
  it('combines fecha + hora into yyyyMMddHHmm for DriCloud', () => {
    expect(naiveDateTimeFromSlot('2026-07-10', '09:00')).toBe('202607100900');
  });

  it('throws for malformed fecha (yyyyMMdd instead of yyyy-MM-dd)', () => {
    expect(() => naiveDateTimeFromSlot('20260710', '09:00')).toThrow();
  });
});
```

- [ ] **Step 4.2: Run test — expect FAIL**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A 3 "ghlMappers"
```

Expected: `Cannot find module './ghlMappers'`

- [ ] **Step 4.3: Implement `server/middleware/ghlMappers.ts`**

```ts
import { normalizePhone } from '../lib/phone';
import { naiveLocalStringToDateTimeForDriCloud, parseDisponibilidad } from '../dricloud/mapper';
import type { DriCloudDoctor, DriCloudEspecialidad, DriCloudPaciente } from '../dricloud/services';

export interface GhlPacienteResponse {
  pac_id: number;
  nombre: string;
  apellidos: string;
  telefono: string;
  email?: string;
}

export interface GhlSlot {
  fecha: string;       // "yyyy-MM-dd"
  hora_inicio: string; // "HH:mm"
  hora_fin: string;    // "HH:mm"
  medico: string;
  especialidad: string | null;
  consulta: number | null;
}

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ── Patient mappers ──────────────────────────────────────────────────────────

export function mapPacienteToResponse(p: DriCloudPaciente): GhlPacienteResponse {
  const result: GhlPacienteResponse = {
    pac_id: p.PAC_ID,
    nombre: p.PAC_NOMBRE,
    apellidos: p.PAC_APELLIDOS,
    telefono: p.PAC_TELEFONO1,
  };
  if (p.PAC_EMAIL) result.email = p.PAC_EMAIL;
  return result;
}

export function buildPacienteCreate(
  nombre: string,
  apellidos: string,
  telefono: string,
): Omit<DriCloudPaciente, 'PAC_ID'> {
  return {
    PAC_NOMBRE: nombre,
    PAC_APELLIDOS: apellidos,
    PAC_TELEFONO1: normalizePhone(telefono),
    PAC_FECHA_NACIMIENTO: '19000101', // unknown DOB placeholder
    PAC_SEXO_ID: 0,
  };
}

// ── Specialty resolution ─────────────────────────────────────────────────────

export function resolveEspId(
  especialidadName: string,
  especialidades: DriCloudEspecialidad[],
): number | null {
  if (!especialidadName) return null;
  const needle = stripAccents(especialidadName.toLowerCase().trim());
  const match = especialidades.find(
    (e) => stripAccents(e.ESP_NOMBRE.toLowerCase().trim()) === needle,
  );
  return match?.ESP_ID ?? null;
}

// ── Slot shape ───────────────────────────────────────────────────────────────

export function slotToGhlShape(
  rawDisp: string,
  doctor: DriCloudDoctor,
  espNombre: string | null,
): GhlSlot {
  const { date, minutes, desId } = parseDisponibilidad(rawDisp);

  const pad = (n: number) => String(n).padStart(2, '0');
  const fecha = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const hora_inicio = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  const endDate = new Date(date.getTime() + minutes * 60000);
  const hora_fin = `${pad(endDate.getHours())}:${pad(endDate.getMinutes())}`;

  return {
    fecha,
    hora_inicio,
    hora_fin,
    medico: `${doctor.USU_NOMBRE} ${doctor.USU_APELLIDOS}`.trim(),
    especialidad: espNombre,
    consulta: desId || null,
  };
}

// ── Confirmation message ─────────────────────────────────────────────────────

const DAYS_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function buildConfirmacionMessage(slot: GhlSlot, doctorFullName: string): string {
  const [yearStr, monthStr, dayStr] = slot.fecha.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  const date = new Date(year, month - 1, day);
  const dayName = DAYS_ES[date.getDay()];
  const monthName = MONTHS_ES[month - 1];
  const espPart = slot.especialidad ? ` (${slot.especialidad})` : '';
  return (
    `Su cita ha sido confirmada para el ${dayName} ${day} de ${monthName}` +
    ` a las ${slot.hora_inicio}h con ${doctorFullName}${espPart}.`
  );
}

// ── Date/time for createCita ─────────────────────────────────────────────────

/**
 * Combines separate "yyyy-MM-dd" and "HH:mm" strings into the "yyyyMMddHHmm"
 * format required by DriCloud's createCita.
 * Delegates to naiveLocalStringToDateTimeForDriCloud so timezone safety is guaranteed.
 */
export function naiveDateTimeFromSlot(fecha: string, hora: string): string {
  return naiveLocalStringToDateTimeForDriCloud(`${fecha}T${hora}`);
}
```

- [ ] **Step 4.4: Run test — expect PASS**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "ghlMappers|PASS|FAIL"
```

Expected: all tests in `ghlMappers.test.ts` → PASS.

- [ ] **Step 4.5: Commit**

```bash
git add server/middleware/ghlMappers.ts server/middleware/ghlMappers.test.ts
git commit -m "feat(ghl): add ghlMappers — patient, slot, specialty, confirmation mappers"
```

---

### Task 5: Handler — `POST /api/ghl/paciente/verificar-o-crear`

**Files:**
- Create: `server/middleware/ghl.routes.ts` (initial skeleton + this handler)
- Create: `server/middleware/ghl.routes.test.ts` (initial skeleton + this handler's tests)
- Modify: `server/routes.ts` (add `registerGhlRoutes` call)

**Interfaces:**
- Consumes:
  - `apiKeyAuth(req, res, next): void` from `./apiKeyAuth` (Task 3)
  - `sendError(res, code, msg, opts?)` from `./ghlError` (Task 1)
  - `mapPacienteToResponse(p: DriCloudPaciente): GhlPacienteResponse` from `./ghlMappers` (Task 4)
  - `buildPacienteCreate(nombre, apellidos, telefono): Omit<DriCloudPaciente, 'PAC_ID'>` from `./ghlMappers` (Task 4)
  - `normalizePhone(raw: unknown): string` from `../lib/phone`
  - `isValidPhone(raw: unknown): boolean` from `../lib/phone`
  - `getPacientePorNombreTelefono(nombre: string, apellidos: string, telefono: string): Promise<{ Exists: boolean; Paciente: DriCloudPaciente }>` from `../dricloud/services`
  - `getPacientesPorTelefono(telefono: string): Promise<{ Pacientes: DriCloudPaciente[] }>` from `../dricloud/services`
  - `createPaciente(p: Omit<DriCloudPaciente, 'PAC_ID'>): Promise<{ PAC_ID: number }>` from `../dricloud/services`
- Produces:
  ```ts
  function registerGhlRoutes(app: Express): void
  ```

---

- [ ] **Step 5.1: Write failing tests**

Create `server/middleware/ghl.routes.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';

// Mock the entire DriCloud service layer — same pattern as idor.security.test.ts
vi.mock('../dricloud/services', async (importOriginal) => {
  const original = await importOriginal<typeof import('../dricloud/services')>();
  return {
    ...original,
    getPacientePorNombreTelefono: vi.fn(),
    getPacientesPorTelefono: vi.fn(),
    createPaciente: vi.fn(),
    getDoctores: vi.fn(),
    getEspecialidades: vi.fn(),
    getAgendaDisponibilidad: vi.fn(),
    createCita: vi.fn(),
    getCitaById: vi.fn(),
    deleteCita: vi.fn(),
  };
});

import * as svc from '../dricloud/services';

const API_KEY = 'ghl-test-key-abc';
const SECRET = 'ghl-test-secret-32-chars-minimum!';

beforeEach(() => {
  process.env.GHL_MIDDLEWARE_API_KEY = API_KEY;
  process.env.GHL_MIDDLEWARE_SECRET = SECRET;
  delete process.env.GHL_LOCATION_ID;
  vi.resetAllMocks();
});

function authHeaders() {
  return { 'X-API-Key': API_KEY };
}

// ── /api/ghl/paciente/verificar-o-crear ──────────────────────────────────────

describe('POST /api/ghl/paciente/verificar-o-crear', () => {
  const url = '/api/ghl/paciente/verificar-o-crear';

  const validBody = {
    telefono: '+34600111222',
    nombre: 'Laura',
    apellidos: 'García',
    crm_contact_id: 'crm-001',
  };

  const existingPaciente = {
    PAC_ID: 10,
    PAC_NOMBRE: 'Laura',
    PAC_APELLIDOS: 'García',
    PAC_TELEFONO1: '+34600111222',
    PAC_FECHA_NACIMIENTO: '19900101',
    PAC_SEXO_ID: 1,
  };

  it('returns 401 when API key is missing', async () => {
    const { app } = await createApp();
    const res = await request(app).post(url).send(validBody);
    expect(res.status).toBe(401);
    expect(res.body.codigo_error).toBe('API_KEY_INVALIDA');
  });

  it('returns 400 (DATOS_INCOMPLETOS) when telefono is missing', async () => {
    const { app } = await createApp();
    const res = await request(app)
      .post(url)
      .set(authHeaders())
      .send({ nombre: 'x', apellidos: 'y', crm_contact_id: 'z' });
    expect(res.status).toBe(400);
    expect(res.body.codigo_error).toBe('DATOS_INCOMPLETOS');
  });

  it('returns 400 (DATOS_INCOMPLETOS) when nombre is missing', async () => {
    const { app } = await createApp();
    const res = await request(app)
      .post(url)
      .set(authHeaders())
      .send({ telefono: '+34600111222', apellidos: 'y', crm_contact_id: 'z' });
    expect(res.status).toBe(400);
    expect(res.body.codigo_error).toBe('DATOS_INCOMPLETOS');
  });

  it('returns existing patient with es_nuevo:false', async () => {
    (svc.getPacientePorNombreTelefono as ReturnType<typeof vi.fn>).mockResolvedValue({
      Exists: true,
      Paciente: existingPaciente,
    });

    const { app } = await createApp();
    const res = await request(app)
      .post(url)
      .set(authHeaders())
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.es_nuevo).toBe(false);
    expect(res.body.paciente.pac_id).toBe(10);
  });

  it('creates a new patient with es_nuevo:true when not found by name+phone', async () => {
    (svc.getPacientePorNombreTelefono as ReturnType<typeof vi.fn>).mockResolvedValue({
      Exists: false,
      Paciente: null,
    });
    (svc.createPaciente as ReturnType<typeof vi.fn>).mockResolvedValue({ PAC_ID: 99 });
    (svc.getPacientesPorTelefono as ReturnType<typeof vi.fn>).mockResolvedValue({
      Pacientes: [{ ...existingPaciente, PAC_ID: 99 }],
    });

    const { app } = await createApp();
    const res = await request(app)
      .post(url)
      .set(authHeaders())
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.es_nuevo).toBe(true);
    expect(res.body.paciente.pac_id).toBe(99);
  });

  it('returns 500 (DRICLOUD_ERROR) when DriCloud throws', async () => {
    (svc.getPacientePorNombreTelefono as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('DriCloud network error'),
    );

    const { app } = await createApp();
    const res = await request(app)
      .post(url)
      .set(authHeaders())
      .send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.codigo_error).toBe('DRICLOUD_ERROR');
  });
});
```

- [ ] **Step 5.2: Run test — expect FAIL**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A 5 "verificar-o-crear"
```

Expected: route 404 or `Cannot find module '../middleware/ghl.routes'`

- [ ] **Step 5.3: Create `server/middleware/ghl.routes.ts`**

```ts
import type { Express, Request, Response } from 'express';
import { apiKeyAuth } from './apiKeyAuth';
import { sendError } from './ghlError';
import {
  mapPacienteToResponse,
  buildPacienteCreate,
  naiveDateTimeFromSlot,
} from './ghlMappers';
import { normalizePhone, isValidPhone } from '../lib/phone';
import {
  getPacientePorNombreTelefono,
  getPacientesPorTelefono,
  createPaciente,
  getDoctores,
  getEspecialidades,
  getAgendaDisponibilidad,
  createCita,
  getCitaById,
  deleteCita,
  type DriCloudDoctor,
  type DriCloudCita,
} from '../dricloud/services';
import { parseDisponibilidad } from '../dricloud/mapper';
import { resolveEspId, slotToGhlShape, buildConfirmacionMessage, type GhlSlot } from './ghlMappers';
import { encodeSlot, decodeSlot, InvalidSlotError, type SlotPayload } from './slotToken';
import { DRICLOUD_CONFIG } from '../dricloud/auth';

export function registerGhlRoutes(app: Express): void {

  // ── POST /api/ghl/paciente/verificar-o-crear ────────────────────────────────
  app.post('/api/ghl/paciente/verificar-o-crear', apiKeyAuth, async (req: Request, res: Response) => {
    const { telefono, nombre, apellidos, crm_contact_id } = req.body ?? {};

    if (!telefono || !nombre || !apellidos || !crm_contact_id) {
      return sendError(res, 'DATOS_INCOMPLETOS', 'Se requieren: telefono, nombre, apellidos, crm_contact_id.');
    }
    if (!isValidPhone(telefono)) {
      return sendError(res, 'DATOS_INCOMPLETOS', `El teléfono no es válido.`);
    }

    const normalizedPhone = normalizePhone(telefono);

    try {
      const found = await getPacientePorNombreTelefono(nombre, apellidos, normalizedPhone);
      if (found.Exists) {
        return res.json({ success: true, es_nuevo: false, paciente: mapPacienteToResponse(found.Paciente) });
      }

      const newPacData = buildPacienteCreate(nombre, apellidos, normalizedPhone);
      const created = await createPaciente(newPacData);

      const listResult = await getPacientesPorTelefono(normalizedPhone);
      const fullPac = listResult.Pacientes.find((p) => p.PAC_ID === created.PAC_ID) ?? {
        PAC_ID: created.PAC_ID,
        PAC_NOMBRE: nombre,
        PAC_APELLIDOS: apellidos,
        PAC_TELEFONO1: normalizedPhone,
        PAC_FECHA_NACIMIENTO: '',
        PAC_SEXO_ID: 0,
      };

      return res.json({ success: true, es_nuevo: true, paciente: mapPacienteToResponse(fullPac) });
    } catch {
      return sendError(res, 'DRICLOUD_ERROR', 'Error al comunicarse con DriCloud.');
    }
  });
}
```

- [ ] **Step 5.4: Register `registerGhlRoutes` in `server/routes.ts`**

Add this import at the top of `server/routes.ts` (after the existing `registerDriCloudRoutes` import on line 6):

```ts
import { registerGhlRoutes } from './middleware/ghl.routes';
```

Add this call inside `registerRoutes()`, right after `registerDriCloudRoutes(app)` on line 14:

```ts
  registerGhlRoutes(app);
```

- [ ] **Step 5.5: Run test — expect PASS**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "verificar-o-crear|PASS|FAIL"
```

Expected: all 5 tests → PASS.

- [ ] **Step 5.6: Commit**

```bash
git add server/middleware/ghl.routes.ts server/middleware/ghl.routes.test.ts server/routes.ts
git commit -m "feat(ghl): add verificar-o-crear handler and register GHL router"
```

---

### Task 6: Handler — `POST /api/ghl/citas/slots-disponibles`

**Files:**
- Modify: `server/middleware/ghl.routes.ts` (add handler)
- Modify: `server/middleware/ghl.routes.test.ts` (add tests)

**Interfaces:**
- Consumes (all already imported in ghl.routes.ts from Task 5):
  - `getDoctores(espId?: number): Promise<DriCloudDoctor[]>`
  - `getEspecialidades(cliId?: number): Promise<DriCloudEspecialidad[]>`
  - `getAgendaDisponibilidad(params: { usuId?: number; fecha: string; diasRecuperar?: number; cliId?: number; }): Promise<DriCloudDisponibilidad>`
  - `parseDisponibilidad(s: string): { date: Date; minutes: number; desId: number }`
  - `resolveEspId(name: string, especialidades: DriCloudEspecialidad[]): number | null`
  - `slotToGhlShape(rawDisp: string, doctor: DriCloudDoctor, espNombre: string | null): GhlSlot`
  - `encodeSlot(payload: SlotPayload): string`
- Request body:
  ```ts
  {
    id_dricloud: number;
    crm_contact_id: string;
    fecha_desde: string;   // "yyyy-MM-dd"
    fecha_hasta: string;   // "yyyy-MM-dd"
    id_medico?: number;
    especialidad?: string;
    preferencia_horaria?: 'mañana' | 'tarde' | 'cualquiera';
  }
  ```

---

- [ ] **Step 6.1: Write failing tests**

Append to `server/middleware/ghl.routes.test.ts`:

```ts
// ── /api/ghl/citas/slots-disponibles ─────────────────────────────────────────

describe('POST /api/ghl/citas/slots-disponibles', () => {
  const url = '/api/ghl/citas/slots-disponibles';

  const doctor: import('../dricloud/services').DriCloudDoctor = {
    USU_ID: 5,
    USU_NOMBRE: 'Ana',
    USU_APELLIDOS: 'Martínez',
    USU_EMAIL: 'ana@clinic.com',
    ListadoESPECIALIDAD: [{ ESP_ID: 5 }],
  };

  const baseBody = {
    id_dricloud: 10,
    crm_contact_id: 'crm-001',
    fecha_desde: '2026-07-10',
    fecha_hasta: '2026-07-10',
  };

  beforeEach(() => {
    (svc.getEspecialidades as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ESP_ID: 5, ESP_NOMBRE: 'Pediatría', ListadoTIPO_CITA: [] },
    ]);
    (svc.getDoctores as ReturnType<typeof vi.fn>).mockResolvedValue([doctor]);
    (svc.getAgendaDisponibilidad as ReturnType<typeof vi.fn>).mockResolvedValue({
      Disponibilidad: ['202607100900:30:3', '202607101000:30:3'],
    });
  });

  it('returns 401 when API key is missing', async () => {
    const { app } = await createApp();
    const res = await request(app).post(url).send(baseBody);
    expect(res.status).toBe(401);
  });

  it('returns 400 (DATOS_INCOMPLETOS) when fecha_desde is missing', async () => {
    const { app } = await createApp();
    const res = await request(app)
      .post(url)
      .set(authHeaders())
      .send({ id_dricloud: 10, crm_contact_id: 'x', fecha_hasta: '2026-07-10' });
    expect(res.status).toBe(400);
    expect(res.body.codigo_error).toBe('DATOS_INCOMPLETOS');
  });

  it('returns slots array with signed slot_id for each entry', async () => {
    const { app } = await createApp();
    const res = await request(app)
      .post(url)
      .set(authHeaders())
      .send(baseBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.slots).toHaveLength(2);
    expect(res.body.slots[0].slot_id).toBeTruthy();
    expect(res.body.slots[0].slot_id).toContain('.');
    expect(res.body.slots[0].fecha).toBe('2026-07-10');
    expect(res.body.slots[0].hora_inicio).toBe('09:00');
  });

  it('caps results at 10 slots', async () => {
    // 15 slots all on 2026-07-10, hours 08:00 to 22:00
    const slots15 = Array.from({ length: 15 }, (_, i) => {
      const h = String(8 + i).padStart(2, '0');
      return `202607100${h}00:30:3`;
    });
    (svc.getAgendaDisponibilidad as ReturnType<typeof vi.fn>).mockResolvedValue({
      Disponibilidad: slots15,
    });
    const { app } = await createApp();
    const res = await request(app)
      .post(url)
      .set(authHeaders())
      .send({ ...baseBody, fecha_hasta: '2026-07-10' });

    expect(res.status).toBe(200);
    expect(res.body.slots.length).toBeLessThanOrEqual(10);
  });

  it('returns NO_SLOTS (HTTP 200, success:false) when no slots', async () => {
    (svc.getAgendaDisponibilidad as ReturnType<typeof vi.fn>).mockResolvedValue({
      Disponibilidad: [],
    });
    const { app } = await createApp();
    const res = await request(app)
      .post(url)
      .set(authHeaders())
      .send(baseBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(false);
    expect(res.body.codigo_error).toBe('NO_SLOTS');
    expect(res.body.accion_sugerida).toBe('ampliar_rango');
  });

  it('filters to mañana (< 14:00) when preferencia_horaria is mañana', async () => {
    (svc.getAgendaDisponibilidad as ReturnType<typeof vi.fn>).mockResolvedValue({
      Disponibilidad: ['202607100900:30:3', '202607101500:30:3'],
    });
    const { app } = await createApp();
    const res = await request(app)
      .post(url)
      .set(authHeaders())
      .send({ ...baseBody, preferencia_horaria: 'mañana' });

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(1);
    expect(res.body.slots[0].hora_inicio).toBe('09:00');
  });

  it('filters to tarde (>= 14:00) when preferencia_horaria is tarde', async () => {
    (svc.getAgendaDisponibilidad as ReturnType<typeof vi.fn>).mockResolvedValue({
      Disponibilidad: ['202607100900:30:3', '202607101500:30:3'],
    });
    const { app } = await createApp();
    const res = await request(app)
      .post(url)
      .set(authHeaders())
      .send({ ...baseBody, preferencia_horaria: 'tarde' });

    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(1);
    expect(res.body.slots[0].hora_inicio).toBe('15:00');
  });
});
```

- [ ] **Step 6.2: Run test — expect FAIL**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A 3 "slots-disponibles"
```

Expected: all slots-disponibles tests fail with 404.

- [ ] **Step 6.3: Add the slots-disponibles handler inside `registerGhlRoutes` in `server/middleware/ghl.routes.ts`**

Add after the verificar-o-crear handler:

```ts
  // ── POST /api/ghl/citas/slots-disponibles ──────────────────────────────────
  app.post('/api/ghl/citas/slots-disponibles', apiKeyAuth, async (req: Request, res: Response) => {
    const { id_dricloud, crm_contact_id, fecha_desde, fecha_hasta, id_medico, especialidad, preferencia_horaria } = req.body ?? {};

    if (!id_dricloud || !crm_contact_id || !fecha_desde || !fecha_hasta) {
      return sendError(res, 'DATOS_INCOMPLETOS', 'Se requieren: id_dricloud, crm_contact_id, fecha_desde, fecha_hasta.');
    }

    try {
      const especialidades = await getEspecialidades(DRICLOUD_CONFIG.clinicaId);

      let targetDoctors: DriCloudDoctor[];
      if (id_medico) {
        const all = await getDoctores();
        targetDoctors = all.filter((d) => d.USU_ID === Number(id_medico));
      } else if (especialidad) {
        const espId = resolveEspId(especialidad, especialidades);
        targetDoctors = await getDoctores(espId ?? undefined);
      } else {
        targetDoctors = await getDoctores();
      }

      const fromDate = new Date(fecha_desde);
      const toDate = new Date(fecha_hasta);
      const daysDiff = Math.round((toDate.getTime() - fromDate.getTime()) / 86400000);
      const diasRecuperar = Math.max(1, Math.min(daysDiff + 1, 31));
      const fechaDriCloud = fecha_desde.replace(/-/g, '');

      const allRawSlots: { raw: string; doc: DriCloudDoctor }[] = [];
      for (const doc of targetDoctors) {
        const disp = await getAgendaDisponibilidad({
          usuId: doc.USU_ID,
          fecha: fechaDriCloud,
          diasRecuperar,
          cliId: DRICLOUD_CONFIG.clinicaId,
        });
        for (const raw of disp.Disponibilidad ?? []) {
          allRawSlots.push({ raw, doc });
        }
      }

      const filtered = allRawSlots.filter(({ raw }) => {
        const { date } = parseDisponibilidad(raw);
        const pad = (n: number) => String(n).padStart(2, '0');
        const slotDate = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        if (slotDate < fecha_desde || slotDate > fecha_hasta) return false;
        if (preferencia_horaria === 'mañana' && date.getHours() >= 14) return false;
        if (preferencia_horaria === 'tarde' && date.getHours() < 14) return false;
        return true;
      });

      if (filtered.length === 0) {
        return sendError(res, 'NO_SLOTS', 'No hay disponibilidad para el rango solicitado.', { accion_sugerida: 'ampliar_rango' });
      }

      const capped = filtered.slice(0, 10);
      const slots = capped.map(({ raw, doc }) => {
        const { date, minutes, desId } = parseDisponibilidad(raw);
        const pad = (n: number) => String(n).padStart(2, '0');
        const fecha = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
        const hora = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

        const espId = doc.ListadoESPECIALIDAD[0]?.ESP_ID ?? null;
        const espObj = espId ? especialidades.find((e) => e.ESP_ID === espId) : null;
        const espNombre = espObj?.ESP_NOMBRE ?? null;
        const tciId = espObj?.ListadoTIPO_CITA[0]?.TCI_ID ?? 0;

        const payload: SlotPayload = {
          u: doc.USU_ID,
          f: fecha,
          h: hora,
          t: tciId,
          d: desId || null,
          m: minutes,
          esp: espId,
        };

        const ghlSlot = slotToGhlShape(raw, doc, espNombre);
        return { ...ghlSlot, slot_id: encodeSlot(payload) };
      });

      return res.json({ success: true, slots });
    } catch {
      return sendError(res, 'DRICLOUD_ERROR', 'Error al obtener disponibilidad de DriCloud.');
    }
  });
```

- [ ] **Step 6.4: Run test — expect PASS**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "slots-disponibles|PASS|FAIL"
```

Expected: all slots-disponibles tests → PASS.

- [ ] **Step 6.5: Commit**

```bash
git add server/middleware/ghl.routes.ts server/middleware/ghl.routes.test.ts
git commit -m "feat(ghl): add slots-disponibles handler with slot_id signing and filters"
```

---

### Task 7: Handler — `POST /api/ghl/citas/reservar`

**Files:**
- Modify: `server/middleware/ghl.routes.ts` (add handler)
- Modify: `server/middleware/ghl.routes.test.ts` (add tests)

**Interfaces:**
- Consumes (all already imported in ghl.routes.ts):
  - `decodeSlot(token: string): SlotPayload` from `./slotToken`
  - `InvalidSlotError` from `./slotToken`
  - `createCita(params: { usuId: number; fechaInicioCitaString: string; pacId: number; tciId?: number; desId?: number; cliId?: number; }): Promise<{ CPA_ID: number }>` from `../dricloud/services`
  - `naiveDateTimeFromSlot(fecha: string, hora: string): string` from `./ghlMappers`
  - `buildConfirmacionMessage(slot: GhlSlot, doctorFullName: string): string` from `./ghlMappers`
- Request body:
  ```ts
  { id_dricloud: number; crm_contact_id: string; slot_id: string; }
  ```

---

- [ ] **Step 7.1: Write failing tests**

Append to `server/middleware/ghl.routes.test.ts`:

```ts
// ── /api/ghl/citas/reservar ──────────────────────────────────────────────────

describe('POST /api/ghl/citas/reservar', () => {
  const url = '/api/ghl/citas/reservar';

  // Build a valid slot_id using the same secret set in beforeEach
  function makeSlotId() {
    const { encodeSlot } = require('./slotToken');
    return encodeSlot({ u: 5, f: '2026-07-10', h: '09:00', t: 7, d: 3, m: 30, esp: 5 });
  }

  const doctor = {
    USU_ID: 5,
    USU_NOMBRE: 'Ana',
    USU_APELLIDOS: 'Martínez',
    USU_EMAIL: 'ana@clinic.com',
    ListadoESPECIALIDAD: [{ ESP_ID: 5 }],
  };

  beforeEach(() => {
    (svc.getDoctores as ReturnType<typeof vi.fn>).mockResolvedValue([doctor]);
    (svc.getEspecialidades as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ESP_ID: 5, ESP_NOMBRE: 'Pediatría', ListadoTIPO_CITA: [] },
    ]);
    (svc.createCita as ReturnType<typeof vi.fn>).mockResolvedValue({ CPA_ID: 123 });
  });

  it('returns 401 when API key is missing', async () => {
    const { app } = await createApp();
    const res = await request(app).post(url).send({});
    expect(res.status).toBe(401);
  });

  it('returns 400 (DATOS_INCOMPLETOS) when slot_id is missing', async () => {
    const { app } = await createApp();
    const res = await request(app)
      .post(url)
      .set(authHeaders())
      .send({ id_dricloud: 10, crm_contact_id: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.codigo_error).toBe('DATOS_INCOMPLETOS');
  });

  it('returns 400 (DATOS_INCOMPLETOS) when slot_id is tampered', async () => {
    const { app } = await createApp();
    const res = await request(app)
      .post(url)
      .set(authHeaders())
      .send({ id_dricloud: 10, crm_contact_id: 'x', slot_id: 'tampered.aaaaaa' });
    expect(res.status).toBe(400);
    expect(res.body.codigo_error).toBe('DATOS_INCOMPLETOS');
  });

  it('creates cita and returns success with mensaje_confirmacion', async () => {
    const { app } = await createApp();
    const slot_id = makeSlotId();
    const res = await request(app)
      .post(url)
      .set(authHeaders())
      .send({ id_dricloud: 10, crm_contact_id: 'crm-001', slot_id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.cita.id_cita_dricloud).toBe(123);
    expect(res.body.cita.crm_calendar_id).toBeNull();
    expect(res.body.cita.mensaje_confirmacion).toContain('09:00');
    expect(svc.createCita).toHaveBeenCalledWith(expect.objectContaining({
      usuId: 5,
      pacId: 10,
      fechaInicioCitaString: '202607100900',
    }));
  });

  it('returns 409 (SLOT_NO_DISPONIBLE) when DriCloud rejects the slot', async () => {
    (svc.createCita as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('slot already taken'),
    );
    const { app } = await createApp();
    const slot_id = makeSlotId();
    const res = await request(app)
      .post(url)
      .set(authHeaders())
      .send({ id_dricloud: 10, crm_contact_id: 'crm-001', slot_id });

    expect(res.status).toBe(409);
    expect(res.body.codigo_error).toBe('SLOT_NO_DISPONIBLE');
  });
});
```

- [ ] **Step 7.2: Run test — expect FAIL**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A 3 "reservar"
```

Expected: all reservar tests fail with 404.

- [ ] **Step 7.3: Add the reservar handler inside `registerGhlRoutes` in `server/middleware/ghl.routes.ts`**

Add after the slots-disponibles handler:

```ts
  // ── POST /api/ghl/citas/reservar ────────────────────────────────────────────
  app.post('/api/ghl/citas/reservar', apiKeyAuth, async (req: Request, res: Response) => {
    const { id_dricloud, crm_contact_id, slot_id } = req.body ?? {};

    if (!id_dricloud || !crm_contact_id || !slot_id) {
      return sendError(res, 'DATOS_INCOMPLETOS', 'Se requieren: id_dricloud, crm_contact_id, slot_id.');
    }

    let payload: SlotPayload;
    try {
      payload = decodeSlot(slot_id);
    } catch (err) {
      if (err instanceof InvalidSlotError) {
        return sendError(res, 'DATOS_INCOMPLETOS', 'El slot_id es inválido o ha sido manipulado.');
      }
      return sendError(res, 'DRICLOUD_ERROR', 'Error al verificar el slot_id.');
    }

    const fechaInicioCitaString = naiveDateTimeFromSlot(payload.f, payload.h);

    try {
      const created = await createCita({
        usuId: payload.u,
        fechaInicioCitaString,
        pacId: Number(id_dricloud),
        tciId: payload.t || undefined,
        desId: payload.d ?? undefined,
        cliId: DRICLOUD_CONFIG.clinicaId,
      });

      // Build hora_fin from slot duration
      const [hh, mm] = payload.h.split(':').map(Number);
      const endMinutes = hh * 60 + mm + payload.m;
      const pad = (n: number) => String(n).padStart(2, '0');
      const hora_fin = `${pad(Math.floor(endMinutes / 60))}:${pad(endMinutes % 60)}`;

      // Resolve doctor name and specialty for the confirmation message
      const allDoctors = await getDoctores();
      const doctor = allDoctors.find((d) => d.USU_ID === payload.u);
      const doctorName = doctor
        ? `${doctor.USU_NOMBRE} ${doctor.USU_APELLIDOS}`.trim()
        : `Doctor ${payload.u}`;

      const especialidades = await getEspecialidades(DRICLOUD_CONFIG.clinicaId);
      const espObj = payload.esp ? especialidades.find((e) => e.ESP_ID === payload.esp) : null;
      const espNombre = espObj?.ESP_NOMBRE ?? null;

      const slot: GhlSlot = {
        fecha: payload.f,
        hora_inicio: payload.h,
        hora_fin,
        medico: doctorName,
        especialidad: espNombre,
        consulta: payload.d,
      };

      const mensaje_confirmacion = buildConfirmacionMessage(slot, doctorName);

      return res.json({
        success: true,
        cita: {
          id_cita_dricloud: created.CPA_ID,
          fecha: payload.f,
          hora_inicio: payload.h,
          hora_fin,
          medico: doctorName,
          especialidad: espNombre,
          consulta: payload.d,
          localizacion: null,
          crm_calendar_id: null,
          mensaje_confirmacion,
        },
      });
    } catch {
      return sendError(res, 'SLOT_NO_DISPONIBLE', 'El slot ya no está disponible. Por favor, elige otro horario.');
    }
  });
```

- [ ] **Step 7.4: Run test — expect PASS**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "reservar|PASS|FAIL"
```

Expected: all reservar tests → PASS.

- [ ] **Step 7.5: Commit**

```bash
git add server/middleware/ghl.routes.ts server/middleware/ghl.routes.test.ts
git commit -m "feat(ghl): add reservar handler with slot decode and cita creation"
```

---

### Task 8: Handler — `POST /api/ghl/citas/cancelar`

**Files:**
- Modify: `server/middleware/ghl.routes.ts` (add handler)
- Modify: `server/middleware/ghl.routes.test.ts` (add tests)

**Interfaces:**
- Consumes (already imported in ghl.routes.ts):
  - `getCitaById(cpaId: number): Promise<DriCloudCita | null>` from `../dricloud/services`
  - `deleteCita(cpaId: number): Promise<{ CPA_ID: number }>` from `../dricloud/services`
- Request body:
  ```ts
  { id_dricloud: number; id_cita_dricloud: number; crm_contact_id: string; }
  ```
- `DriCloudCita.PAC_ID` is `number | undefined` — the ownership check compares it to `id_dricloud`.

---

- [ ] **Step 8.1: Write failing tests**

Append to `server/middleware/ghl.routes.test.ts`:

```ts
// ── /api/ghl/citas/cancelar ──────────────────────────────────────────────────

describe('POST /api/ghl/citas/cancelar', () => {
  const url = '/api/ghl/citas/cancelar';

  const validBody = {
    id_dricloud: 10,
    id_cita_dricloud: 555,
    crm_contact_id: 'crm-001',
  };

  const ownedCita: import('../dricloud/services').DriCloudCita = {
    CPA_ID: 555,
    USU_ID: 5,
    CPA_FECHA_INICIO: '202607100900',
    CPA_FECHA_FIN: '202607100930',
    PAC_ID: 10, // matches id_dricloud in validBody
  };

  it('returns 401 when API key is missing', async () => {
    const { app } = await createApp();
    const res = await request(app).post(url).send(validBody);
    expect(res.status).toBe(401);
  });

  it('returns 400 (DATOS_INCOMPLETOS) when id_cita_dricloud is missing', async () => {
    const { app } = await createApp();
    const res = await request(app)
      .post(url)
      .set(authHeaders())
      .send({ id_dricloud: 10, crm_contact_id: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.codigo_error).toBe('DATOS_INCOMPLETOS');
  });

  it('returns 404 (PACIENTE_NO_ENCONTRADO) when getCitaById returns null', async () => {
    (svc.getCitaById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { app } = await createApp();
    const res = await request(app).post(url).set(authHeaders()).send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.codigo_error).toBe('PACIENTE_NO_ENCONTRADO');
  });

  it('returns 403 and does NOT call deleteCita when PAC_ID mismatches id_dricloud', async () => {
    (svc.getCitaById as ReturnType<typeof vi.fn>).mockResolvedValue({ ...ownedCita, PAC_ID: 999 });
    (svc.deleteCita as ReturnType<typeof vi.fn>).mockResolvedValue({ CPA_ID: 555 });

    const { app } = await createApp();
    const res = await request(app).post(url).set(authHeaders()).send(validBody);

    expect(res.status).toBe(403);
    expect(svc.deleteCita).not.toHaveBeenCalled();
  });

  it('cancels and returns success message when ownership matches', async () => {
    (svc.getCitaById as ReturnType<typeof vi.fn>).mockResolvedValue(ownedCita);
    (svc.deleteCita as ReturnType<typeof vi.fn>).mockResolvedValue({ CPA_ID: 555 });

    const { app } = await createApp();
    const res = await request(app).post(url).set(authHeaders()).send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.mensaje).toContain('Cita cancelada');
    expect(svc.deleteCita).toHaveBeenCalledWith(555);
  });

  it('returns 500 (DRICLOUD_ERROR) when deleteCita throws', async () => {
    (svc.getCitaById as ReturnType<typeof vi.fn>).mockResolvedValue(ownedCita);
    (svc.deleteCita as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network error'));

    const { app } = await createApp();
    const res = await request(app).post(url).set(authHeaders()).send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.codigo_error).toBe('DRICLOUD_ERROR');
  });

  it('returns 500 (DRICLOUD_ERROR) when getCitaById throws', async () => {
    (svc.getCitaById as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('DriCloud down'));

    const { app } = await createApp();
    const res = await request(app).post(url).set(authHeaders()).send(validBody);

    expect(res.status).toBe(500);
    expect(res.body.codigo_error).toBe('DRICLOUD_ERROR');
  });
});
```

- [ ] **Step 8.2: Run test — expect FAIL**

```bash
npm test -- --reporter=verbose 2>&1 | grep -A 3 "cancelar"
```

Expected: all cancelar tests fail with 404.

- [ ] **Step 8.3: Add the cancelar handler inside `registerGhlRoutes` in `server/middleware/ghl.routes.ts`**

Add after the reservar handler:

```ts
  // ── POST /api/ghl/citas/cancelar ────────────────────────────────────────────
  app.post('/api/ghl/citas/cancelar', apiKeyAuth, async (req: Request, res: Response) => {
    const { id_dricloud, id_cita_dricloud, crm_contact_id } = req.body ?? {};

    if (!id_dricloud || !id_cita_dricloud || !crm_contact_id) {
      return sendError(res, 'DATOS_INCOMPLETOS', 'Se requieren: id_dricloud, id_cita_dricloud, crm_contact_id.');
    }

    const cpaId = Number(id_cita_dricloud);

    let cita: DriCloudCita | null;
    try {
      cita = await getCitaById(cpaId);
    } catch {
      return sendError(res, 'DRICLOUD_ERROR', 'Error al verificar la cita en DriCloud.');
    }

    if (!cita) {
      return sendError(res, 'PACIENTE_NO_ENCONTRADO', `La cita ${cpaId} no existe.`);
    }

    // Ownership guard: PAC_ID on the appointment must match the patient's DriCloud ID
    if (cita.PAC_ID !== Number(id_dricloud)) {
      return res.status(403).json({
        success: false,
        codigo_error: 'FORBIDDEN',
        mensaje: 'No tienes permiso para cancelar esta cita.',
      });
    }

    try {
      await deleteCita(cpaId);
      return res.json({
        success: true,
        mensaje: 'Cita cancelada correctamente. El hueco ha quedado libre.',
      });
    } catch {
      return sendError(res, 'DRICLOUD_ERROR', 'Error al cancelar la cita en DriCloud.');
    }
  });
```

- [ ] **Step 8.4: Run test — expect PASS**

```bash
npm test -- --reporter=verbose 2>&1 | grep -E "cancelar|PASS|FAIL"
```

Expected: all cancelar tests → PASS.

- [ ] **Step 8.5: Commit**

```bash
git add server/middleware/ghl.routes.ts server/middleware/ghl.routes.test.ts
git commit -m "feat(ghl): add cancelar handler with PAC_ID ownership guard"
```

---

### Task 9: Full suite green check

**Files:**
- No new files. Verify all test suites pass without regression.

**Interfaces:**
- Consumes: completed artifacts from Tasks 1–8.
- Produces: clean `npm test` run and passing TypeScript compiler.

---

- [ ] **Step 9.1: Run full test suite**

```bash
npm test 2>&1 | tail -40
```

Expected: output contains lines like:
```
✓ server/middleware/ghlError.test.ts (7)
✓ server/middleware/slotToken.test.ts (9)
✓ server/middleware/apiKeyAuth.test.ts (7)
✓ server/middleware/ghlMappers.test.ts
✓ server/middleware/ghl.routes.test.ts
✓ server/dricloud/mapper.test.ts
✓ server/routes/idor.security.test.ts
```

Zero failures.

- [ ] **Step 9.2: Verify TypeScript compiles**

```bash
npm run check 2>&1 | tail -10
```

Expected: exits with code 0 and no type errors.

- [ ] **Step 9.3: Confirm no hardcoded secrets in middleware source**

```bash
grep -r "GHL_MIDDLEWARE" server/middleware/ --include="*.ts" | grep -v "\.test\.ts" | grep -v "process\.env"
```

Expected: no output.

- [ ] **Step 9.4: Final commit**

```bash
git add -A
git status
git commit -m "chore(ghl): full test suite green, types compile, no hardcoded secrets"
```

---

## File Map Summary

| File | Status | Task |
|------|--------|------|
| `server/middleware/ghlError.ts` | Create | 1 |
| `server/middleware/ghlError.test.ts` | Create | 1 |
| `server/middleware/slotToken.ts` | Create | 2 |
| `server/middleware/slotToken.test.ts` | Create | 2 |
| `server/middleware/apiKeyAuth.ts` | Create | 3 |
| `server/middleware/apiKeyAuth.test.ts` | Create | 3 |
| `server/middleware/ghlMappers.ts` | Create | 4 |
| `server/middleware/ghlMappers.test.ts` | Create | 4 |
| `server/middleware/ghl.routes.ts` | Create (Task 5), Modify (Tasks 6–8) | 5–8 |
| `server/middleware/ghl.routes.test.ts` | Create (Task 5), Modify (Tasks 6–8) | 5–8 |
| `server/routes.ts` | Modify — add `registerGhlRoutes(app)` call | 5 |
