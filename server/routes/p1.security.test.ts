/**
 * P1 security regression tests — Issues #4, #5, #6, #7, #8
 *
 * #4: POST /api/doctors requires authentication
 * #5: Response logger does not leak PII (phone) into log output
 * #6: GET /api/dricloud/diagnostico and POST /api/dricloud/refresh require auth
 * #7: Helmet security headers are present; x-powered-by is absent
 * #8: isPiiKey and redactPii cover DriCloud + local appointment PII fields
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp, redactPii, isPiiKey } from '../app';
import * as otpService from '../services/otpService';
import * as dricloudPatients from '../dricloud/services';

// ── Helpers ────────────────────────────────────────────────────────────────────

async function authenticatedAgent(app: Express, phone: string) {
  const agent = request.agent(app);
  const otp = otpService.createOtp(phone, `contact-${phone}`);
  const res = await agent
    .post('/api/auth/verify-otp')
    .send({ phoneNumber: phone, otp });
  expect(res.status).toBe(200);
  return agent;
}

// ── Issue #4: POST /api/doctors requires authentication ────────────────────────

describe('#4 — POST /api/doctors requires authentication', () => {
  it('returns 401 for unauthenticated POST /api/doctors', async () => {
    const { app } = await createApp();
    const res = await request(app)
      .post('/api/doctors')
      .send({ name: 'Dr. Anon', specialty: 'General' });
    expect(res.status).toBe(401);
  });

  it('returns 201 for authenticated POST /api/doctors with valid data', async () => {
    const { app } = await createApp();
    const agent = await authenticatedAgent(app, '+34700000001');
    const res = await agent
      .post('/api/doctors')
      .send({ name: 'Dr. Auth', specialty: 'adult', email: 'dr.auth@example.com' });
    expect(res.status).toBe(201);
  });
});

// ── Issue #5: Response logger does not leak PII (phone) ────────────────────────

describe('#5 — Response logger does not log phone from /api/auth/me', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('log output does not contain the user phone after GET /api/auth/me', async () => {
    const { app } = await createApp();
    const phone = '+34700000002';
    const agent = await authenticatedAgent(app, phone);

    // Capture what console.log receives (the log() function in vite.ts calls console.log)
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await agent.get('/api/auth/me');

    // Collect all log lines emitted during the request
    const loggedLines = consoleSpy.mock.calls.map((args) => args.join(' '));
    const phoneDigits = phone.replace(/\D/g, ''); // e.g. "34700000002"

    // Assert: none of the logged lines contain the raw phone digits
    const leak = loggedLines.find((line) => line.includes(phoneDigits));
    expect(leak).toBeUndefined();
  });

  it('log output still contains the HTTP method and status for /api/auth/me', async () => {
    const { app } = await createApp();
    const phone = '+34700000003';
    const agent = await authenticatedAgent(app, phone);

    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await agent.get('/api/auth/me');

    const loggedLines = consoleSpy.mock.calls.map((args) => args.join(' '));
    // At least one line should reference the path and status
    const hasMethodAndStatus = loggedLines.some(
      (line) => line.includes('/api/auth/me') && line.includes('200'),
    );
    expect(hasMethodAndStatus).toBe(true);
  });
});

// ── Issue #6: DriCloud /diagnostico and /refresh are authenticated ─────────────

describe('#6 — DriCloud diagnostic and refresh routes require authentication', () => {
  it('GET /api/dricloud/diagnostico returns 401 for unauthenticated request', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/dricloud/diagnostico');
    expect(res.status).toBe(401);
  });

  it('POST /api/dricloud/refresh returns 401 for unauthenticated request', async () => {
    const { app } = await createApp();
    const res = await request(app).post('/api/dricloud/refresh');
    expect(res.status).toBe(401);
  });

  it('GET /api/dricloud/diagnostico does not return 401 for authenticated request', async () => {
    const { app } = await createApp();
    const agent = await authenticatedAgent(app, '+34700000004');
    const res = await agent.get('/api/dricloud/diagnostico');
    // Authenticated — should NOT be 401 (may be 200 or 502 depending on DriCloud availability)
    expect(res.status).not.toBe(401);
  });

  it('POST /api/dricloud/refresh does not return 401 for authenticated request', async () => {
    const { app } = await createApp();
    const agent = await authenticatedAgent(app, '+34700000005');
    const res = await agent.post('/api/dricloud/refresh');
    // Authenticated — should NOT be 401
    expect(res.status).not.toBe(401);
  });
});

// ── Issue #7: Helmet headers present; x-powered-by absent ─────────────────────

describe('#7 — Security headers (Helmet) and x-powered-by removal', () => {
  it('response includes x-content-type-options: nosniff (Helmet baseline header)', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/auth/me');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('response includes x-dns-prefetch-control header (Helmet)', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/auth/me');
    expect(res.headers['x-dns-prefetch-control']).toBeDefined();
  });

  it('response does NOT include x-powered-by header', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/auth/me');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});

// ── Issue #8: isPiiKey pattern matcher ────────────────────────────────────────
//
// These unit tests for isPiiKey and redactPii are the authoritative regression
// guard for the redaction logic. Log-spy integration tests on full endpoint
// responses pass trivially because the 80-char truncation in the logger cuts
// most JSON before PII field values appear. The unit tests below prove the
// function's contract directly.

describe('#8 — isPiiKey: pattern matcher recognises all sensitive field names', () => {
  // ── DriCloud PII fields ───────────────────────────────────────────────────────
  it.each([
    'PAC_TELEFONO1',
    'PAC_TELEFONO2',
    'PAC_EMAIL',
    'PAC_NIF',
    'PAC_PASAPORTE',
    'PAC_NOMBRE',
    'PAC_APELLIDOS',
    'PAC_FECHA_NACIMIENTO',
  ])('isPiiKey("%s") is true (DriCloud field)', (key) => {
    expect(isPiiKey(key)).toBe(true);
  });

  // ── Local appointment PII fields ──────────────────────────────────────────────
  it.each(['patientPhone', 'patientName', 'patientEmail'])(
    'isPiiKey("%s") is true (appointment field)',
    (key) => {
      expect(isPiiKey(key)).toBe(true);
    },
  );

  // ── Original exact-match fields still covered ─────────────────────────────────
  it.each(['phone', 'password', 'token', 'secret', 'otp'])(
    'isPiiKey("%s") is true (original fields)',
    (key) => {
      expect(isPiiKey(key)).toBe(true);
    },
  );

  // ── Case-insensitivity (DriCloud uses ALL_CAPS) ───────────────────────────────
  it.each(['pac_nombre', 'PAC_EMAIL', 'Pac_Telefono1'])(
    'isPiiKey("%s") is true regardless of case',
    (key) => {
      expect(isPiiKey(key)).toBe(true);
    },
  );

  // ── Non-PII fields must NOT be flagged ────────────────────────────────────────
  it.each([
    'PAC_ID',
    'PAC_SEXO_ID',
    'CPA_ID',
    'USU_ID',
    'doctorId',
    'status',
    'duration',
    'appointmentDate',
    'ok',
    'id',
  ])('isPiiKey("%s") is false', (key) => {
    expect(isPiiKey(key)).toBe(false);
  });
});

describe('#8 — redactPii: replaces PII values with [REDACTED] on a copy', () => {
  // ── Flat DriCloud-shaped object ───────────────────────────────────────────────
  it('redacts PAC_TELEFONO1, PAC_EMAIL, PAC_NIF, PAC_NOMBRE, PAC_APELLIDOS, PAC_FECHA_NACIMIENTO', () => {
    const input = {
      PAC_ID: 42,
      PAC_NOMBRE: 'Maria',
      PAC_APELLIDOS: 'Garcia',
      PAC_FECHA_NACIMIENTO: '1990-01-01',
      PAC_TELEFONO1: '600111222',
      PAC_EMAIL: 'maria@example.com',
      PAC_NIF: 'X1234567Z',
      PAC_SEXO_ID: 1,
    };

    const result = redactPii(input);

    expect(result.PAC_NOMBRE).toBe('[REDACTED]');
    expect(result.PAC_APELLIDOS).toBe('[REDACTED]');
    expect(result.PAC_FECHA_NACIMIENTO).toBe('[REDACTED]');
    expect(result.PAC_TELEFONO1).toBe('[REDACTED]');
    expect(result.PAC_EMAIL).toBe('[REDACTED]');
    expect(result.PAC_NIF).toBe('[REDACTED]');
    // Non-PII fields are preserved
    expect(result.PAC_ID).toBe(42);
    expect(result.PAC_SEXO_ID).toBe(1);
  });

  // ── Local appointment-shaped object ───────────────────────────────────────────
  it('redacts patientName, patientPhone, patientEmail in a local appointment object', () => {
    const input = {
      id: 'uuid-123',
      doctorId: 'doctor-uuid',
      patientName: 'Juan Perez',
      patientPhone: '+34611000111',
      patientEmail: 'juan@test.com',
      patientAge: 35,
      status: 'scheduled',
    };

    const result = redactPii(input);

    expect(result.patientName).toBe('[REDACTED]');
    expect(result.patientPhone).toBe('[REDACTED]');
    expect(result.patientEmail).toBe('[REDACTED]');
    // Non-PII fields are preserved
    expect(result.id).toBe('uuid-123');
    expect(result.doctorId).toBe('doctor-uuid');
    expect(result.patientAge).toBe(35);
    expect(result.status).toBe('scheduled');
  });

  // ── Array of DriCloud pacientes (GET /api/dricloud/patients shape) ────────────
  it('redacts PII inside each element of an array nested under a key', () => {
    const pacientes = [
      {
        PAC_ID: 1,
        PAC_NOMBRE: 'Ana',
        PAC_APELLIDOS: 'Lopez',
        PAC_TELEFONO1: '611222333',
        PAC_EMAIL: 'ana@test.com',
        PAC_NIF: 'A0000001B',
        PAC_SEXO_ID: 1,
        PAC_FECHA_NACIMIENTO: '1985-06-15',
      },
      {
        PAC_ID: 2,
        PAC_NOMBRE: 'Carlos',
        PAC_APELLIDOS: 'Ruiz',
        PAC_TELEFONO1: '622333444',
        PAC_SEXO_ID: 2,
        PAC_FECHA_NACIMIENTO: '1970-11-30',
      },
    ];

    // Wrap in an object to test the array-recursion path in redactPii.
    const wrapper = { data: pacientes } as Record<string, unknown>;
    const result = redactPii(wrapper);
    const redacted = result.data as Record<string, unknown>[];

    expect(redacted[0].PAC_NOMBRE).toBe('[REDACTED]');
    expect(redacted[0].PAC_APELLIDOS).toBe('[REDACTED]');
    expect(redacted[0].PAC_TELEFONO1).toBe('[REDACTED]');
    expect(redacted[0].PAC_EMAIL).toBe('[REDACTED]');
    expect(redacted[0].PAC_NIF).toBe('[REDACTED]');
    expect(redacted[0].PAC_FECHA_NACIMIENTO).toBe('[REDACTED]');
    expect(redacted[0].PAC_ID).toBe(1);

    expect(redacted[1].PAC_NOMBRE).toBe('[REDACTED]');
    expect(redacted[1].PAC_TELEFONO1).toBe('[REDACTED]');
    expect(redacted[1].PAC_ID).toBe(2);
  });

  // ── Mutation guard: redactPii must return a copy, never mutate the original ───
  it('does NOT mutate the original flat object', () => {
    const original = {
      PAC_ID: 10,
      PAC_NOMBRE: 'RealName',
      PAC_TELEFONO1: '699000000',
      PAC_EMAIL: 'real@example.com',
    };
    const snapshot = { ...original };

    redactPii(original);

    expect(original.PAC_NOMBRE).toBe(snapshot.PAC_NOMBRE);
    expect(original.PAC_TELEFONO1).toBe(snapshot.PAC_TELEFONO1);
    expect(original.PAC_EMAIL).toBe(snapshot.PAC_EMAIL);
  });

  it('does NOT mutate nested objects', () => {
    const nested = { PAC_EMAIL: 'nested@test.com', PAC_ID: 5 };
    const wrapper = { patient: nested, count: 1 } as Record<string, unknown>;

    redactPii(wrapper);

    // The original nested object must be untouched
    expect(nested.PAC_EMAIL).toBe('nested@test.com');
  });

  // ── Preserves the original set of existing-covered fields ────────────────────
  it('still redacts the original exact-match fields (phone, password, token, secret, otp)', () => {
    const input = {
      phone: '+34600000000',
      password: 'supersecret',
      token: 'eyJhbGc',
      secret: 'mysecret',
      otp: '123456',
      ok: true,
    };

    const result = redactPii(input);

    expect(result.phone).toBe('[REDACTED]');
    expect(result.password).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
    expect(result.secret).toBe('[REDACTED]');
    expect(result.otp).toBe('[REDACTED]');
    expect(result.ok).toBe(true);
  });
});

// ── Integration: API response body intact (logger must not mutate the response) ─

describe('#8 — Integration: API response body is intact after redaction', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/dricloud/patients response body still contains PAC_TELEFONO1 and PAC_NOMBRE', async () => {
    const { app } = await createApp();
    const phone = '+34700000015';
    const agent = await authenticatedAgent(app, phone);

    vi.spyOn(dricloudPatients, 'getPacientesPorTelefono').mockResolvedValue({
      Pacientes: [
        {
          PAC_ID: 6,
          PAC_NOMBRE: 'MutationTest',
          PAC_APELLIDOS: 'Guard',
          PAC_FECHA_NACIMIENTO: '1988-02-14',
          PAC_SEXO_ID: 1,
          PAC_TELEFONO1: '611000111',
        },
      ],
    });

    vi.spyOn(console, 'log').mockImplementation(() => {});

    const res = await agent.get('/api/dricloud/patients');

    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
    // The client-facing response must have the real values (logger copy-only)
    expect(res.body[0].PAC_TELEFONO1).toBe('611000111');
    expect(res.body[0].PAC_NOMBRE).toBe('MutationTest');
  });

  it('POST /api/appointments response body still contains patientEmail and patientName', async () => {
    const { app } = await createApp();
    const phone = '+34700000023';
    const agent = await authenticatedAgent(app, phone);

    const doctorRes = await agent
      .post('/api/doctors')
      .send({ name: 'Dr. Mutation', specialty: 'adult', email: 'drmut@test.com' });
    expect(doctorRes.status).toBe(201);
    const doctorId = doctorRes.body.id;

    vi.spyOn(console, 'log').mockImplementation(() => {});

    const apptRes = await agent.post('/api/appointments').send({
      doctorId,
      patientName: 'MutationGuardName',
      patientPhone: phone,
      patientEmail: 'mutation.guard@test.com',
      patientAge: 35,
      appointmentDate: new Date('2027-04-05T14:00:00Z').toISOString(),
      duration: 30,
      status: 'scheduled',
    });

    expect(apptRes.status).toBe(201);
    // The actual HTTP response body must still have the real values
    expect(apptRes.body.patientEmail).toBe('mutation.guard@test.com');
    expect(apptRes.body.patientName).toBe('MutationGuardName');
  });
});
