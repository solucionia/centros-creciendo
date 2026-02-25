import type { Express } from 'express';
import {
  getEspecialidades,
  getDoctores,
  getAgendaDisponibilidad,
  getPacientesPorTelefono,
  getPacientePorNombreTelefono,
  getPacienteByNIF,
  createPaciente,
  createCita,
  updateCita,
  deleteCita,
  getCitasByNIF,
  getCitasPacientes,
  getDespachos,
} from '../dricloud/services';
import {
  mapDriCloudDoctor,
  formatDateForDriCloud,
  formatDateTimeForDriCloud,
  parseDisponibilidad,
  splitFullName,
} from '../dricloud/mapper';
import { DRICLOUD_CONFIG, clearTokenCache, DriCloudSubscriptionError } from '../dricloud/auth';
import {
  mockEspecialidades,
  mockDoctores,
  generateMockAvailability,
  createMockAppointment,
  createMockPatient,
} from '../dricloud/mock-data';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Devuelve true si el error es de suscripción inactiva */
function isSubscriptionErr(err: unknown): boolean {
  if (err instanceof DriCloudSubscriptionError) return err.isSubscriptionError();
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('suscripci');
  }
  return false;
}

/** Cabeceras que evitan que el navegador/proxy cachée respuestas de la API */
function noCache(_req: any, res: any, next: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}

// ─── Registro de rutas ────────────────────────────────────────────────────────
export function registerDriCloudRoutes(app: Express) {

  app.use('/api/dricloud', noCache);

  // ── Estado / diagnóstico ───────────────────────────────────────────────────

  /** GET /api/dricloud/status — devuelve si estamos en modo demo o real */
  app.get('/api/dricloud/status', async (_req, res) => {
    try {
      await getEspecialidades(DRICLOUD_CONFIG.clinicaId);
      console.log('[DriCloud] ✅ Conectado - datos reales disponibles');
      res.json({ isDemoMode: false, message: 'Conectado a DriCloud' });
    } catch (err) {
      if (isSubscriptionErr(err)) {
        console.log('[DriCloud] ⚠️  Suscripción no activa — modo demostración');
        res.json({ isDemoMode: true, message: 'Suscripción WebAPI no activa en DriCloud' });
      } else {
        console.error('[DriCloud] Error de conexión en /status:', err);
        res.status(502).json({ error: 'Error de conexión con DriCloud' });
      }
    }
  });

  /** GET /api/dricloud/diagnostico — respuesta RAW de DriCloud para soporte */
  app.get('/api/dricloud/diagnostico', async (_req, res) => {
    try {
      clearTokenCache();
      const especialidades = await getEspecialidades(DRICLOUD_CONFIG.clinicaId);
      res.json({
        estado: 'OK',
        especialidadesObtenidas: especialidades.length,
        endpointUsado: `${DRICLOUD_CONFIG.baseUrl}/${DRICLOUD_CONFIG.urlClinica}/api/APIWeb/GetEspecialidades`,
      });
    } catch (err: any) {
      res.json({
        estado: 'ERROR',
        mensaje: err.message,
        endpointUsado: `${DRICLOUD_CONFIG.baseUrl}/${DRICLOUD_CONFIG.urlClinica}/api/APIWeb/GetEspecialidades`,
      });
    }
  });

  /** POST /api/dricloud/refresh — fuerza reconexión limpiando el token cacheado */
  app.post('/api/dricloud/refresh', async (_req, res) => {
    clearTokenCache();
    try {
      await getEspecialidades(DRICLOUD_CONFIG.clinicaId);
      res.json({ success: true, isDemoMode: false, message: 'Reconectado a DriCloud con éxito' });
    } catch (err) {
      if (isSubscriptionErr(err)) {
        res.json({ success: true, isDemoMode: true, message: 'Suscripción WebAPI no activa' });
      } else {
        res.status(502).json({ success: false, error: 'Error al reconectar con DriCloud' });
      }
    }
  });

  // ── Especialidades ─────────────────────────────────────────────────────────

  /** GET /api/dricloud/specialties */
  app.get('/api/dricloud/specialties', async (_req, res) => {
    try {
      const data = await getEspecialidades(DRICLOUD_CONFIG.clinicaId);
      console.log(`[DriCloud] ✅ ${data.length} especialidades reales`);
      res.json(data);
    } catch (err) {
      if (isSubscriptionErr(err)) {
        console.log('[DriCloud] ⚠️  Usando especialidades demo');
        res.json(mockEspecialidades);
      } else {
        console.error('[DriCloud] Error en /specialties:', err);
        res.status(502).json({ error: 'Error al obtener especialidades' });
      }
    }
  });

  // ── Doctores ───────────────────────────────────────────────────────────────

  /** GET /api/dricloud/doctors?especialidadId=X */
  app.get('/api/dricloud/doctors', async (req, res) => {
    try {
      const espId = req.query.especialidadId ? parseInt(req.query.especialidadId as string) : undefined;

      const [especialidades, doctores] = await Promise.all([
        getEspecialidades(DRICLOUD_CONFIG.clinicaId),
        getDoctores(espId),
      ]);

      const mapped = doctores.map(doc => ({
        id: doc.USU_ID.toString(),
        driCloudId: doc.USU_ID,
        ...mapDriCloudDoctor(doc, especialidades),
      }));
      console.log(`[DriCloud] ✅ ${mapped.length} doctores reales`);
      res.json(mapped);
    } catch (err) {
      if (isSubscriptionErr(err)) {
        console.log('[DriCloud] ⚠️  Usando doctores demo');
        const espId = req.query.especialidadId ? parseInt(req.query.especialidadId as string) : undefined;
        const filtered = espId
          ? mockDoctores.filter(d => d.ListadoESPECIALIDAD.some(e => e.ESP_ID === espId))
          : mockDoctores;
        res.json(filtered.map(doc => ({
          id: doc.USU_ID.toString(),
          driCloudId: doc.USU_ID,
          ...mapDriCloudDoctor(doc, mockEspecialidades),
        })));
      } else {
        console.error('[DriCloud] Error en /doctors:', err);
        res.status(502).json({ error: 'Error al obtener doctores' });
      }
    }
  });

  // ── Disponibilidad ─────────────────────────────────────────────────────────

  /** GET /api/dricloud/availability?doctorId=X&fecha=yyyyMMdd&diasRecuperar=7 */
  app.get('/api/dricloud/availability', async (req, res) => {
    const { doctorId, fecha, diasRecuperar = '7' } = req.query;
    if (!doctorId || !fecha) {
      return res.status(400).json({ error: 'Se requieren doctorId y fecha' });
    }

    try {
      const disp = await getAgendaDisponibilidad({
        usuId: parseInt(doctorId as string),
        fecha: fecha as string,
        cliId: DRICLOUD_CONFIG.clinicaId,
        diasRecuperar: parseInt(diasRecuperar as string),
      });
      const slots = (disp.Disponibilidad ?? []).map(parseDisponibilidad);
      console.log(`[DriCloud] ✅ ${slots.length} slots de disponibilidad reales`);
      res.json(slots);
    } catch (err) {
      if (isSubscriptionErr(err)) {
        console.log('[DriCloud] ⚠️  Usando disponibilidad demo');
        const startDate = new Date(
          parseInt((fecha as string).substring(0, 4)),
          parseInt((fecha as string).substring(4, 6)) - 1,
          parseInt((fecha as string).substring(6, 8))
        );
        const mockSlots = generateMockAvailability(
          parseInt(doctorId as string),
          startDate,
          parseInt(diasRecuperar as string)
        );
        res.json(mockSlots.map(parseDisponibilidad));
      } else {
        console.error('[DriCloud] Error en /availability:', err);
        res.status(502).json({ error: 'Error al obtener disponibilidad' });
      }
    }
  });

  // ── Pacientes ──────────────────────────────────────────────────────────────

  /** GET /api/dricloud/patients?telefono=X */
  app.get('/api/dricloud/patients', async (req, res) => {
    const { telefono } = req.query;
    if (!telefono) return res.status(400).json({ error: 'Se requiere telefono' });
    try {
      const result = await getPacientesPorTelefono(telefono as string);
      res.json(result.Pacientes ?? []);
    } catch (err) {
      console.error('[DriCloud] Error en /patients:', err);
      res.status(502).json({ error: 'Error al buscar pacientes' });
    }
  });

  // ── Citas ──────────────────────────────────────────────────────────────────

  /** POST /api/dricloud/appointments — crea una cita */
  app.post('/api/dricloud/appointments', async (req, res) => {
    const {
      doctorId,
      patientName,
      patientEmail,
      patientPhone,
      patientAge,
      appointmentDate,
      specialtyName,
      notes,
      tciId,
      desId,
    } = req.body;

    if (!doctorId || !patientName || !patientPhone || !appointmentDate) {
      return res.status(400).json({
        error: 'Faltan campos: doctorId, patientName, patientPhone, appointmentDate',
      });
    }

    const { nombre, apellidos } = splitFullName(patientName);
    const fechaCita = formatDateTimeForDriCloud(new Date(appointmentDate));

    try {
      // 1. Buscar o crear paciente
      let pacId: number;
      const pacResult = await getPacientePorNombreTelefono(nombre, apellidos, patientPhone);

      if (pacResult.Exists) {
        pacId = pacResult.Paciente.PAC_ID;
        console.log('[DriCloud] Paciente existente:', pacId);
      } else {
        const nacimiento = new Date();
        nacimiento.setFullYear(nacimiento.getFullYear() - (patientAge ?? 30));
        const newPac = await createPaciente({
          PAC_NOMBRE: nombre,
          PAC_APELLIDOS: apellidos,
          PAC_TELEFONO1: patientPhone,
          PAC_EMAIL: patientEmail ?? '',
          PAC_FECHA_NACIMIENTO: formatDateForDriCloud(nacimiento),
          PAC_SEXO_ID: 0,
        });
        pacId = newPac.PAC_ID;
        console.log('[DriCloud] Paciente creado:', pacId);
      }

      // 2. Crear cita
      const cita = await createCita({
        usuId: parseInt(doctorId),
        fechaInicioCitaString: fechaCita,
        pacId,
        tciId: tciId ? parseInt(tciId) : undefined,
        desId: desId ? parseInt(desId) : undefined,
        cliId: DRICLOUD_CONFIG.clinicaId,
        observaciones: notes,
      });

      console.log('[DriCloud] ✅ Cita creada:', cita.CPA_ID);
      res.status(201).json({
        citaId: cita.CPA_ID,
        pacienteId: pacId,
        isDemoMode: false,
        message: 'Cita creada en DriCloud',
      });
    } catch (err) {
      if (isSubscriptionErr(err)) {
        // Modo demostración
        console.log('[DriCloud] ⚠️  Cita creada en modo demo');
        const mockPacId = createMockPatient({ nombre, apellidos, telefono: patientPhone, email: patientEmail ?? '', fechaNacimiento: '' });
        const mockCitaId = createMockAppointment({ patientName, doctorId: parseInt(doctorId), datetime: appointmentDate, specialty: specialtyName ?? 'General' });
        res.status(201).json({
          citaId: mockCitaId,
          pacienteId: mockPacId,
          isDemoMode: true,
          message: 'Cita creada en modo demostración',
        });
      } else {
        console.error('[DriCloud] Error al crear cita:', err);
        res.status(502).json({ error: 'Error al crear la cita en DriCloud' });
      }
    }
  });

  /** PUT /api/dricloud/appointments/:id — modifica una cita */
  app.put('/api/dricloud/appointments/:id', async (req, res) => {
    const cpaId = parseInt(req.params.id);
    const { appointmentDate, minutos } = req.body;

    if (!appointmentDate) return res.status(400).json({ error: 'Se requiere appointmentDate' });

    const fechaCita = formatDateTimeForDriCloud(new Date(appointmentDate));
    try {
      const result = await updateCita({ cpaId, fechaInicioCitaString: fechaCita, minutos });
      console.log('[DriCloud] ✅ Cita modificada:', result.CPA_ID);
      res.json({ citaId: result.CPA_ID, isDemoMode: false, message: 'Cita modificada en DriCloud' });
    } catch (err) {
      if (isSubscriptionErr(err)) {
        res.json({ citaId: cpaId, isDemoMode: true, message: 'Cita modificada en modo demo' });
      } else {
        console.error('[DriCloud] Error al modificar cita:', err);
        res.status(502).json({ error: 'Error al modificar la cita' });
      }
    }
  });

  /** POST /api/dricloud/appointments/:id/cancel — cancela (elimina) una cita */
  app.post('/api/dricloud/appointments/:id/cancel', async (req, res) => {
    const cpaId = parseInt(req.params.id);
    if (isNaN(cpaId)) return res.status(400).json({ error: 'ID de cita inválido' });

    try {
      await deleteCita(cpaId);
      console.log('[DriCloud] ✅ Cita cancelada:', cpaId);
      res.json({ success: true, isDemoMode: false, message: 'Cita cancelada en DriCloud' });
    } catch (err) {
      if (isSubscriptionErr(err)) {
        res.json({ success: true, isDemoMode: true, message: 'Cita cancelada en modo demo' });
      } else {
        console.error('[DriCloud] Error al cancelar cita:', err);
        res.status(502).json({ error: 'Error al cancelar la cita' });
      }
    }
  });

  /** GET /api/dricloud/appointments?nif=X&fechaInicio=yyyyMMdd&fechaFin=yyyyMMdd */
  app.get('/api/dricloud/appointments', async (req, res) => {
    const { nif, fechaInicio, fechaFin, usuId } = req.query;
    if (!nif) return res.status(400).json({ error: 'Se requiere nif del paciente' });

    try {
      const citas = await getCitasByNIF({
        nif: nif as string,
        fechaInicioString: fechaInicio as string | undefined,
        fechaFinString: fechaFin as string | undefined,
        usuId: usuId ? parseInt(usuId as string) : undefined,
      });
      res.json(citas);
    } catch (err) {
      if (isSubscriptionErr(err)) {
        res.json([]);
      } else {
        console.error('[DriCloud] Error en GET /appointments:', err);
        res.status(502).json({ error: 'Error al obtener citas' });
      }
    }
  });
}
