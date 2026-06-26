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
}
