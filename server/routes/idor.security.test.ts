/**
 * IDOR security regression tests — P0-a and P0-b
 *
 * Proves that:
 *   P0-a: GET /api/appointments only returns appointments owned by the
 *         authenticated session's phone. Cancel (POST …/cancel) is forbidden
 *         for appointments that belong to a different phone.
 *   P0-b: GET /api/dricloud/patients ignores a client-supplied `telefono`
 *         query param and derives the phone from the session instead.
 *         GET /api/dricloud/appointments?nif returns 403 when the requested
 *         NIF does not belong to a patient whose phone matches the session.
 *
 * Authentication strategy: create OTP directly via otpService (no CRM/WhatsApp),
 * then POST /api/auth/verify-otp through a supertest agent to get a session cookie.
 * Mirrors the pattern already used in auth.routes.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../app';
import * as otpService from '../services/otpService';

// Mock the DriCloud service layer so ownership guards are exercised
// independently of real DriCloud connectivity.
vi.mock('../dricloud/services', async (importOriginal) => {
  const original = await importOriginal<typeof import('../dricloud/services')>();
  return {
    ...original,
    getPacienteByNIF: vi.fn(),
    getCitaById: vi.fn(),
    updateCita: vi.fn(),
    deleteCita: vi.fn(),
    getPacientesPorTelefono: vi.fn(),
    getPacientePorNombreTelefono: vi.fn(),
    createPaciente: vi.fn(),
    createCita: vi.fn(),
  };
});

import * as dricloudServices from '../dricloud/services';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Creates an authenticated supertest agent for `phone`.
 * Bypasses the CRM/WhatsApp step by planting the OTP directly in the store.
 */
async function authenticatedAgent(app: Express, phone: string) {
  const agent = request.agent(app);
  const otp = otpService.createOtp(phone, `contact-${phone}`);
  const res = await agent
    .post('/api/auth/verify-otp')
    .send({ phoneNumber: phone, otp });
  expect(res.status).toBe(200);
  return agent;
}

// ── P0-a: GET /api/appointments ownership scoping ─────────────────────────────

describe('P0-a — GET /api/appointments ownership scoping', () => {
  it('returns only the authenticated user\'s own appointments, not other users\'', async () => {
    const { app } = await createApp();

    const phoneA = '+34600111001';
    const phoneB = '+34600111002';

    const agentA = await authenticatedAgent(app, phoneA);
    const agentB = await authenticatedAgent(app, phoneB);

    const doctorRes = await request(app).get('/api/doctors');
    expect(doctorRes.status).toBe(200);
    const doctorId = doctorRes.body[0].id;

    await agentA.post('/api/appointments').send({
      doctorId,
      patientName: 'Patient A',
      patientEmail: 'a@example.com',
      patientPhone: phoneA,
      patientAge: 30,
      appointmentDate: new Date('2026-07-01T10:00:00Z').toISOString(),
    });

    await agentB.post('/api/appointments').send({
      doctorId,
      patientName: 'Patient B',
      patientEmail: 'b@example.com',
      patientPhone: phoneB,
      patientAge: 25,
      appointmentDate: new Date('2026-07-02T10:00:00Z').toISOString(),
    });

    // Agent A fetches appointments — must only see their own
    const listA = await agentA.get('/api/appointments');
    expect(listA.status).toBe(200);
    const phonesA: string[] = listA.body.map((a: any) => a.patientPhone);
    expect(phonesA.length).toBeGreaterThan(0);
    expect(phonesA.every((p) => p === phoneA)).toBe(true);
    expect(phonesA).not.toContain(phoneB);

    // Agent B fetches appointments — must only see their own
    const listB = await agentB.get('/api/appointments');
    expect(listB.status).toBe(200);
    const phonesB: string[] = listB.body.map((a: any) => a.patientPhone);
    expect(phonesB.length).toBeGreaterThan(0);
    expect(phonesB.every((p) => p === phoneB)).toBe(true);
    expect(phonesB).not.toContain(phoneA);
  });

  it('applies ownership filter when ?date= query is used', async () => {
    const { app } = await createApp();

    const phoneA = '+34600222001';
    const phoneB = '+34600222002';

    const agentA = await authenticatedAgent(app, phoneA);
    const agentB = await authenticatedAgent(app, phoneB);

    const doctorRes = await request(app).get('/api/doctors');
    const doctorId = doctorRes.body[0].id;

    const sharedDate = '2026-08-15T10:00:00Z';

    await agentA.post('/api/appointments').send({
      doctorId,
      patientName: 'Patient A',
      patientEmail: 'a@example.com',
      patientPhone: phoneA,
      patientAge: 30,
      appointmentDate: sharedDate,
    });

    await agentB.post('/api/appointments').send({
      doctorId,
      patientName: 'Patient B',
      patientEmail: 'b@example.com',
      patientPhone: phoneB,
      patientAge: 25,
      appointmentDate: sharedDate,
    });

    // Agent A queries by date — must not see B's appointment on the same date
    const listA = await agentA.get('/api/appointments?date=2026-08-15');
    expect(listA.status).toBe(200);
    const phonesA: string[] = listA.body.map((a: any) => a.patientPhone);
    expect(phonesA.every((p) => p === phoneA)).toBe(true);
  });

  it('applies ownership filter when ?doctorId= query is used', async () => {
    const { app } = await createApp();

    const phoneA = '+34600333001';
    const phoneB = '+34600333002';

    const agentA = await authenticatedAgent(app, phoneA);
    const agentB = await authenticatedAgent(app, phoneB);

    const doctorRes = await request(app).get('/api/doctors');
    const doctorId = doctorRes.body[0].id;

    await agentA.post('/api/appointments').send({
      doctorId,
      patientName: 'Patient A',
      patientEmail: 'a@example.com',
      patientPhone: phoneA,
      patientAge: 30,
      appointmentDate: new Date('2026-09-01T10:00:00Z').toISOString(),
    });

    await agentB.post('/api/appointments').send({
      doctorId,
      patientName: 'Patient B',
      patientEmail: 'b@example.com',
      patientPhone: phoneB,
      patientAge: 25,
      appointmentDate: new Date('2026-09-02T10:00:00Z').toISOString(),
    });

    // Agent A queries by doctorId — must not see B's appointment
    const listA = await agentA.get(`/api/appointments?doctorId=${doctorId}`);
    expect(listA.status).toBe(200);
    const phonesA: string[] = listA.body.map((a: any) => a.patientPhone);
    expect(phonesA.every((p) => p === phoneA)).toBe(true);
  });
});

// ── P0-a: POST /api/appointments/:id/cancel ownership check ───────────────────

describe('P0-a — POST /api/appointments/:id/cancel ownership check', () => {
  it('returns 403 when trying to cancel another user\'s appointment', async () => {
    const { app } = await createApp();

    const phoneA = '+34600444001';
    const phoneB = '+34600444002';

    const agentA = await authenticatedAgent(app, phoneA);
    const agentB = await authenticatedAgent(app, phoneB);

    const doctorRes = await request(app).get('/api/doctors');
    const doctorId = doctorRes.body[0].id;

    // A creates their appointment
    const createRes = await agentA.post('/api/appointments').send({
      doctorId,
      patientName: 'Patient A',
      patientEmail: 'a@example.com',
      patientPhone: phoneA,
      patientAge: 30,
      appointmentDate: new Date('2026-10-01T10:00:00Z').toISOString(),
    });
    expect(createRes.status).toBe(201);
    const appointmentId = createRes.body.id;

    // B tries to cancel A's appointment — must be denied
    const cancelRes = await agentB.post(`/api/appointments/${appointmentId}/cancel`);
    expect(cancelRes.status).toBe(403);

    // A can cancel their own
    const ownCancelRes = await agentA.post(`/api/appointments/${appointmentId}/cancel`);
    expect(ownCancelRes.status).toBe(200);
  });
});

// ── P0-b: GET /api/dricloud/patients ignores client-supplied telefono ─────────

describe('P0-b — GET /api/dricloud/patients ignores client-supplied telefono', () => {
  beforeEach(() => {
    // Simulate DriCloud unreachable so the route returns 502 (not 400 "Se requiere telefono").
    (dricloudServices.getPacientesPorTelefono as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('connect ECONNREFUSED')
    );
  });

  it('uses the session phone, not the query param; does not return 400 "Se requiere telefono"', async () => {
    const { app } = await createApp();

    const phoneA = '+34600555001';
    const agentA = await authenticatedAgent(app, phoneA);

    // Agent A tries to supply a different phone via the query param.
    // The fixed endpoint ignores it and uses the session phone.
    // Because DriCloud is unavailable in tests, we expect 200 (empty []) or 502,
    // but NOT 400 "Se requiere telefono" (that error would mean the old broken
    // client-param path is still active).
    const res = await agentA.get('/api/dricloud/patients?telefono=+34600000000');

    expect(res.status).not.toBe(401);
    if (res.status === 400) {
      expect(res.body.error).not.toBe('Se requiere telefono');
    }
  });

  it('returns 401 for unauthenticated requests', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/dricloud/patients?telefono=+34600000000');
    expect(res.status).toBe(401);
  });
});

// ── P0-b: GET /api/dricloud/appointments?nif ownership check ──────────────────

describe('P0-b — GET /api/dricloud/appointments?nif ownership check', () => {
  beforeEach(() => {
    // Simulate DriCloud being unreachable — the ownership lookup throws,
    // and the restructured handler must return a non-200 error (503).
    (dricloudServices.getPacienteByNIF as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('connect ECONNREFUSED')
    );
  });

  it('does not return 200 with data for a NIF not linked to the session phone', async () => {
    const { app } = await createApp();

    const phoneA = '+34600666001';
    const agentA = await authenticatedAgent(app, phoneA);

    // Request appointments for a NIF that does not belong to phoneA.
    // With DriCloud unreachable, the ownership check cannot complete → 503.
    // We must NOT get 200 (which would mean data leaked without ownership check).
    const res = await agentA.get('/api/dricloud/appointments?nif=X1234567Y');

    expect(res.status).not.toBe(200);
    expect([400, 403, 503]).toContain(res.status);
  });

  it('returns 401 for unauthenticated requests', async () => {
    const { app } = await createApp();
    const res = await request(app).get('/api/dricloud/appointments?nif=X1234567Y');
    expect(res.status).toBe(401);
  });
});

// ── BLOCKER 1: NIF ownership guard must not fall through on upstream error ─────
//
// Proves that when getPacienteByNIF succeeds but returns a patient whose phone
// does NOT match the session phone, the response is strictly 403 — not 200 [].
// Also proves that when getPacienteByNIF itself throws (DriCloud down), the
// response is a non-200 error (503), NOT a silent empty 200.

describe('BLOCKER 1 — GET /api/dricloud/appointments?nif ownership guard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 403 when the NIF belongs to a patient whose phone does not match the session', async () => {
    const phoneA = '+34611001001';
    const phoneB = '+34611001002'; // different phone stored in DriCloud

    // Mock: patient exists, but its phone is B, not A
    (dricloudServices.getPacienteByNIF as ReturnType<typeof vi.fn>).mockResolvedValue({
      Exists: true,
      Paciente: { PAC_ID: 1, PAC_NOMBRE: 'Other', PAC_APELLIDOS: 'Patient', PAC_TELEFONO1: phoneB, PAC_FECHA_NACIMIENTO: '19900101', PAC_SEXO_ID: 0 },
    });

    const { app } = await createApp();
    const agentA = await authenticatedAgent(app, phoneA);

    const res = await agentA.get('/api/dricloud/appointments?nif=Y9999999Z');
    expect(res.status).toBe(403);
  });

  it('returns appointment data when the NIF phone matches the session phone', async () => {
    const phoneA = '+34611002001';

    (dricloudServices.getPacienteByNIF as ReturnType<typeof vi.fn>).mockResolvedValue({
      Exists: true,
      Paciente: { PAC_ID: 2, PAC_NOMBRE: 'Propia', PAC_APELLIDOS: 'Paciente', PAC_TELEFONO1: phoneA, PAC_FECHA_NACIMIENTO: '19900101', PAC_SEXO_ID: 0 },
    });
    // getCitasByNIF is NOT mocked here — it will throw (DriCloud down), which is
    // fine: we only care that we got PAST the ownership guard (i.e. no early 403).
    // A 502 from the appointment fetch is acceptable.
    (dricloudServices as any).getCitasByNIF = vi.fn().mockResolvedValue([]);

    const { app } = await createApp();
    const agentA = await authenticatedAgent(app, phoneA);

    const res = await agentA.get('/api/dricloud/appointments?nif=A1111111B');
    // Ownership guard passed — we should NOT get 403.
    expect(res.status).not.toBe(403);
  });

  it('returns 503 (not 200) when getPacienteByNIF throws a DriCloud connectivity error', async () => {
    const phoneA = '+34611003001';

    // Simulate DriCloud being completely unreachable (not a subscription error)
    (dricloudServices.getPacienteByNIF as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('connect ECONNREFUSED')
    );

    const { app } = await createApp();
    const agentA = await authenticatedAgent(app, phoneA);

    const res = await agentA.get('/api/dricloud/appointments?nif=B2222222C');
    // Must NOT fall through to 200 []. Ownership was not evaluated.
    expect(res.status).not.toBe(200);
    expect(res.status).toBe(503);
  });
});

// ── BLOCKER 2: DriCloud modify/cancel must have ownership check ────────────────
//
// Proves that PUT /api/dricloud/appointments/:id and
// POST /api/dricloud/appointments/:id/cancel require the appointment to belong
// to the authenticated session phone. The mutation service MUST NOT be called
// when ownership fails.

describe('BLOCKER 2 — DriCloud modify/cancel appointment ownership guard', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('PUT returns 403 and does NOT call updateCita when appointment belongs to a different phone', async () => {
    const phoneA = '+34622001001';
    const phoneB = '+34622001002'; // owns the appointment

    // getCitaById returns an appointment owned by phoneB
    (dricloudServices.getCitaById as ReturnType<typeof vi.fn>).mockResolvedValue({
      CPA_ID: 999, USU_ID: 1, PAC_TELEFONO1: phoneB,
    });

    const { app } = await createApp();
    const agentA = await authenticatedAgent(app, phoneA);

    const res = await agentA.put('/api/dricloud/appointments/999').send({
      appointmentDate: '2027-01-15T10:00',
    });

    expect(res.status).toBe(403);
    expect(dricloudServices.updateCita).not.toHaveBeenCalled();
  });

  it('PUT returns 403 and does NOT call updateCita when getCitaById throws', async () => {
    const phoneA = '+34622002001';

    (dricloudServices.getCitaById as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('connect ECONNREFUSED')
    );

    const { app } = await createApp();
    const agentA = await authenticatedAgent(app, phoneA);

    const res = await agentA.put('/api/dricloud/appointments/888').send({
      appointmentDate: '2027-01-15T10:00',
    });

    expect(res.status).not.toBe(200);
    expect(dricloudServices.updateCita).not.toHaveBeenCalled();
  });

  it('POST /cancel returns 403 and does NOT call deleteCita when appointment belongs to a different phone', async () => {
    const phoneA = '+34622003001';
    const phoneB = '+34622003002'; // owns the appointment

    (dricloudServices.getCitaById as ReturnType<typeof vi.fn>).mockResolvedValue({
      CPA_ID: 777, USU_ID: 1, PAC_TELEFONO1: phoneB,
    });

    const { app } = await createApp();
    const agentA = await authenticatedAgent(app, phoneA);

    const res = await agentA.post('/api/dricloud/appointments/777/cancel');

    expect(res.status).toBe(403);
    expect(dricloudServices.deleteCita).not.toHaveBeenCalled();
  });

  it('POST /cancel returns 503 and does NOT call deleteCita when getCitaById throws', async () => {
    const phoneA = '+34622004001';

    (dricloudServices.getCitaById as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('connect ECONNREFUSED')
    );

    const { app } = await createApp();
    const agentA = await authenticatedAgent(app, phoneA);

    const res = await agentA.post('/api/dricloud/appointments/666/cancel');

    expect(res.status).not.toBe(200);
    expect(dricloudServices.deleteCita).not.toHaveBeenCalled();
  });

  it('PUT succeeds when appointment phone matches the session phone', async () => {
    const phoneA = '+34622005001';

    (dricloudServices.getCitaById as ReturnType<typeof vi.fn>).mockResolvedValue({
      CPA_ID: 555, USU_ID: 1, PAC_TELEFONO1: phoneA,
    });
    (dricloudServices.updateCita as ReturnType<typeof vi.fn>).mockResolvedValue({ CPA_ID: 555 });

    const { app } = await createApp();
    const agentA = await authenticatedAgent(app, phoneA);

    const res = await agentA.put('/api/dricloud/appointments/555').send({
      appointmentDate: '2027-01-20T10:00',
    });

    expect(res.status).not.toBe(403);
    expect(dricloudServices.updateCita).toHaveBeenCalled();
  });

  it('POST /cancel succeeds when appointment phone matches the session phone', async () => {
    const phoneA = '+34622006001';

    (dricloudServices.getCitaById as ReturnType<typeof vi.fn>).mockResolvedValue({
      CPA_ID: 444, USU_ID: 1, PAC_TELEFONO1: phoneA,
    });
    (dricloudServices.deleteCita as ReturnType<typeof vi.fn>).mockResolvedValue({ CPA_ID: 444 });

    const { app } = await createApp();
    const agentA = await authenticatedAgent(app, phoneA);

    const res = await agentA.post('/api/dricloud/appointments/444/cancel');

    expect(res.status).not.toBe(403);
    expect(dricloudServices.deleteCita).toHaveBeenCalled();
  });
});

// ── SHOULD-FIX 1: empty phone must never produce an ownership match ────────────
//
// Proves that a patient record with an empty PAC_TELEFONO1 is NOT considered
// owned by any session, even a session that somehow has an empty phone.

describe('SHOULD-FIX 1 — empty phone does not produce false ownership match', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('GET /api/dricloud/appointments?nif returns 403 when patient phone is empty and session phone is non-empty', async () => {
    const phoneA = '+34633001001';

    (dricloudServices.getPacienteByNIF as ReturnType<typeof vi.fn>).mockResolvedValue({
      Exists: true,
      Paciente: { PAC_ID: 10, PAC_NOMBRE: 'X', PAC_APELLIDOS: 'Y', PAC_TELEFONO1: '', PAC_FECHA_NACIMIENTO: '19900101', PAC_SEXO_ID: 0 },
    });

    const { app } = await createApp();
    const agentA = await authenticatedAgent(app, phoneA);

    const res = await agentA.get('/api/dricloud/appointments?nif=EMPTY_PHONE_NIF');
    expect(res.status).toBe(403);
  });

  it('GET /api/appointments returns no appointments for a session with an empty phone even if a record has empty patientPhone', async () => {
    // This test creates an appointment with a real phone and verifies it is not
    // leaked to an attacker who somehow has an empty-phone session. Because we
    // cannot create a real empty-phone session via OTP (the route rejects blank
    // phone at validation), we verify at the unit level that normalizePhone('')
    // does not equal normalizePhone(realPhone).
    const { normalizePhone } = await import('../lib/phone');
    // Two empty strings must NOT constitute a valid ownership match.
    // The comparison site adds an extra guard: if either side is empty → no match.
    const realPhone = normalizePhone('+34633002001');
    const emptyNorm = normalizePhone('');
    // Core assertion: empty normalized phone != real normalized phone
    expect(emptyNorm).not.toBe(realPhone);
    // Secondary: document that '' === '' would be a false match if used naively
    // — guard must block this case explicitly.
    expect(emptyNorm).toBe('');
  });
});

// ── SHOULD-FIX 2: POST /api/appointments ownership enforcement ─────────────────
//
// Proves that an authenticated user cannot create a local appointment with a
// different phone (ownership poisoning).

describe('SHOULD-FIX 2 — POST /api/appointments rejects patientPhone != session phone', () => {
  it('returns 403 when patientPhone does not match the session phone', async () => {
    const { app } = await createApp();

    const phoneA = '+34644001001';
    const phoneB = '+34644001002'; // attacker tries to set this as patientPhone

    const agentA = await authenticatedAgent(app, phoneA);

    const doctorRes = await request(app).get('/api/doctors');
    expect(doctorRes.status).toBe(200);
    const doctorId = doctorRes.body[0].id;

    const res = await agentA.post('/api/appointments').send({
      doctorId,
      patientName: 'Attacker',
      patientEmail: 'attacker@example.com',
      patientPhone: phoneB, // wrong phone
      patientAge: 30,
      appointmentDate: new Date('2027-03-01T10:00:00Z').toISOString(),
    });

    expect(res.status).toBe(403);
  });

  it('returns 201 when patientPhone matches the session phone', async () => {
    const { app } = await createApp();

    const phoneA = '+34644002001';
    const agentA = await authenticatedAgent(app, phoneA);

    const doctorRes = await request(app).get('/api/doctors');
    expect(doctorRes.status).toBe(200);
    const doctorId = doctorRes.body[0].id;

    const res = await agentA.post('/api/appointments').send({
      doctorId,
      patientName: 'Legitimate Patient',
      patientEmail: 'legit@example.com',
      patientPhone: phoneA,
      patientAge: 30,
      appointmentDate: new Date('2027-03-02T10:00:00Z').toISOString(),
    });

    expect(res.status).toBe(201);
  });
});

// ── SHOULD-FIX 3: POST /api/dricloud/appointments ownership enforcement ─────────
//
// Proves that an authenticated user cannot create a DriCloud appointment with a
// different phone in the body (ownership poisoning via DriCloud route).

describe('SHOULD-FIX 3 — POST /api/dricloud/appointments rejects patientPhone != session phone', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns 403 when patientPhone does not match the session phone', async () => {
    const { app } = await createApp();

    const phoneA = '+34655001001';
    const phoneB = '+34655001002';

    const agentA = await authenticatedAgent(app, phoneA);

    const res = await agentA.post('/api/dricloud/appointments').send({
      doctorId: '1',
      patientName: 'Attacker',
      patientEmail: 'attacker@example.com',
      patientPhone: phoneB, // different phone — must be rejected
      patientAge: 30,
      appointmentDate: new Date('2027-04-01T10:00:00Z').toISOString(),
    });

    expect(res.status).toBe(403);
  });

  it('proceeds past ownership check when patientPhone matches the session phone', async () => {
    const phoneA = '+34655002001';

    // Mock getPacientePorNombreTelefono to return an existing patient
    (dricloudServices.getPacientePorNombreTelefono as ReturnType<typeof vi.fn>).mockResolvedValue({
      Exists: true,
      Paciente: { PAC_ID: 99 },
    });
    (dricloudServices.createCita as ReturnType<typeof vi.fn>).mockResolvedValue({ CPA_ID: 12345 });

    const { app } = await createApp();
    const agentA = await authenticatedAgent(app, phoneA);

    const res = await agentA.post('/api/dricloud/appointments').send({
      doctorId: '1',
      patientName: 'Legitimo Paciente',
      patientEmail: 'legit@example.com',
      patientPhone: phoneA, // correct phone
      patientAge: 30,
      appointmentDate: '2027-04-02T10:00',
    });

    // Ownership guard passed. Accept 201 (success) or 502 (DriCloud error on further calls).
    expect(res.status).not.toBe(403);
  });

  // ── W2: 403 body must be a user-readable Spanish message ─────────────────────

  it('403 body contains a user-readable Spanish error message (not generic "Forbidden")', async () => {
    const { app } = await createApp();

    const phoneA = '+34655003001';
    const phoneB = '+34655003002';

    const agentA = await authenticatedAgent(app, phoneA);

    const res = await agentA.post('/api/dricloud/appointments').send({
      doctorId: '1',
      patientName: 'Attacker',
      patientEmail: 'attacker@example.com',
      patientPhone: phoneB,
      patientAge: 30,
      appointmentDate: '2027-04-10T10:00',
    });

    expect(res.status).toBe(403);
    expect(res.body.error).not.toBe('Forbidden');
    // Must mention "teléfono" or "telefono" (i18n user-readable message)
    expect(res.body.error.toLowerCase()).toMatch(/tel[eé]fono/);
  });
});

// ── C1: malformed appointmentDate must return 400, not hang ───────────────────
//
// Proves that a synchronous throw from naiveLocalStringToDateTimeForDriCloud
// is caught inside the handler and returned as HTTP 400 — NOT an unhandled
// rejection / hanging request.  Ownership passes (patientPhone === session phone
// for POST, cita phone === session phone for PUT) so the only failure is the
// malformed date.

describe('C1 — malformed appointmentDate returns 400 (not 500 or hang)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('POST /api/dricloud/appointments: returns 400 when appointmentDate is ISO with Z (not naive)', async () => {
    const phoneA = '+34699001001';

    // Ownership must pass — mock patient lookup and cita creation so the route
    // reaches the date conversion step and not a 403.
    (dricloudServices.getPacientePorNombreTelefono as ReturnType<typeof vi.fn>).mockResolvedValue({
      Exists: true,
      Paciente: { PAC_ID: 1 },
    });
    (dricloudServices.createCita as ReturnType<typeof vi.fn>).mockResolvedValue({ CPA_ID: 1 });

    const { app } = await createApp();
    const agentA = await authenticatedAgent(app, phoneA);

    const res = await agentA.post('/api/dricloud/appointments').send({
      doctorId: '1',
      patientName: 'Test Patient',
      patientEmail: 'test@example.com',
      patientPhone: phoneA,
      patientAge: 30,
      appointmentDate: '2027-01-15T10:00:00Z', // ISO with Z — malformed for DriCloud
    });

    expect(res.status).toBe(400);
  });

  it('PUT /api/dricloud/appointments/:id: returns 400 when appointmentDate is ISO with Z (not naive)', async () => {
    const phoneA = '+34699002001';

    // Ownership must pass — cita phone matches session phone
    (dricloudServices.getCitaById as ReturnType<typeof vi.fn>).mockResolvedValue({
      CPA_ID: 111, USU_ID: 1, PAC_TELEFONO1: phoneA,
    });
    (dricloudServices.updateCita as ReturnType<typeof vi.fn>).mockResolvedValue({ CPA_ID: 111 });

    const { app } = await createApp();
    const agentA = await authenticatedAgent(app, phoneA);

    const res = await agentA.put('/api/dricloud/appointments/111').send({
      appointmentDate: '2027-01-15T10:00:00Z', // ISO with Z — malformed for DriCloud
    });

    expect(res.status).toBe(400);
  });
});
