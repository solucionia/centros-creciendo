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
