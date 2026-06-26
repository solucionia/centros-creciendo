import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../app';
import { encodeSlot } from './slotToken';

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

// ── /api/ghl/citas/reservar ──────────────────────────────────────────────────

describe('POST /api/ghl/citas/reservar', () => {
  const url = '/api/ghl/citas/reservar';

  // Build a valid slot_id using the same secret set in beforeEach
  function makeSlotId() {
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
