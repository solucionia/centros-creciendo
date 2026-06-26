import { describe, it, expect } from 'vitest';
import {
  mapPacienteToResponse,
  buildPacienteCreate,
  resolveEspId,
  slotToGhlShape,
  buildConfirmacionMessage,
  naiveDateTimeFromSlot,
  addMinutesToWallClock,
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

describe('addMinutesToWallClock', () => {
  it('adds minutes within the same hour', () => {
    expect(addMinutesToWallClock('09:50', 20)).toBe('10:10');
  });

  it('wraps past midnight correctly', () => {
    expect(addMinutesToWallClock('23:50', 20)).toBe('00:10');
  });

  it('adds zero minutes — returns same time', () => {
    expect(addMinutesToWallClock('14:00', 0)).toBe('14:00');
  });

  it('result matches slotToGhlShape hora_fin for the same slot', () => {
    // rawDisp '202607100950:20:3' → hora_inicio 09:50, duration 20 min → hora_fin 10:10
    const slot = slotToGhlShape('202607100950:20:3', sampleDoctor, null);
    expect(slot.hora_fin).toBe(addMinutesToWallClock('09:50', 20));
  });
});
