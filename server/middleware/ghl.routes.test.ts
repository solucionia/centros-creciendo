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
