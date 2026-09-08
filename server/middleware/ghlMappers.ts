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
    PAC_FECHA_NACIMIENTO: '1900-01-01', // unknown DOB placeholder — DriCloud exige formato ISO yyyy-MM-dd (yyyyMMdd da ErrorCode -2)
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

// ── Wall-clock arithmetic ────────────────────────────────────────────────────

/**
 * Adds `minutes` to a "HH:mm" wall-clock string using pure integer math.
 * No Date objects — no DST sensitivity.
 * Wraps past midnight (e.g. "23:50" + 20 → "00:10").
 */
export function addMinutesToWallClock(hora: string, minutes: number): string {
  const [hhStr, mmStr] = hora.split(':');
  const total = parseInt(hhStr, 10) * 60 + parseInt(mmStr, 10) + minutes;
  const HH = Math.floor(total / 60) % 24;
  const MM = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(HH)}:${pad(MM)}`;
}

// ── Slot shape ───────────────────────────────────────────────────────────────

export function slotToGhlShape(
  rawDisp: string,
  doctor: DriCloudDoctor,
  espNombre: string | null,
): GhlSlot {
  const { localDateString, minutes, desId } = parseDisponibilidad(rawDisp);

  const fecha = localDateString.slice(0, 10);
  const hora_inicio = localDateString.slice(11, 16);
  const hora_fin = addMinutesToWallClock(hora_inicio, minutes);

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
