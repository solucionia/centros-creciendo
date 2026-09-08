import type { Express } from 'express';
import { requireAuth } from './auth.routes';
import { normalizePhone } from '../lib/phone';
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
  getCitaById,
  getDespachos,
} from '../dricloud/services';
import {
  mapDriCloudDoctor,
  formatDateTimeForDriCloud,
  naiveLocalStringToDateTimeForDriCloud,
  formatBirthDateForDriCloud,
  parseDisponibilidad,
  splitFullName,
} from '../dricloud/mapper';
import { DRICLOUD_CONFIG, clearTokenCache, DriCloudSubscriptionError, getClinicaApiUrl } from '../dricloud/auth';
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

/**
 * Mapa de ESP_ID conocidos de la clínica Creciendo Mirasierra → nombre de especialidad
 * Derivado del campo CITA_ONLINE_MAS_INFO de los doctores reales
 */
const ESP_ID_NAMES: Record<number, string> = {
  5: 'Pediatría',
  4: 'Ginecología',
  19: 'Otorrinolaringología',
  41: 'Otorrinolaringología',
  11: 'Dermatología',
  30: 'Matrona y Lactancia',
  45: 'Matrona y Lactancia',
  23: 'Matrona y Lactancia',
  8: 'Medicina General',
  44: 'Medicina General',
  53: 'Medicina General',
};

/**
 * Extrae texto plano de HTML (elimina etiquetas y decodifica entidades básicas)
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é')
    .replace(/&iacute;/g, 'í').replace(/&oacute;/g, 'ó')
    .replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&Ntilde;/g, 'Ñ').replace(/&Aacute;/g, 'Á')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

/**
 * Intenta derivar el nombre de una especialidad dado su ESP_ID y datos del doctor.
 */
function deriveSpecialtyName(espId: number, _doc: any): string {
  return ESP_ID_NAMES[espId] ?? `Especialidad ${espId}`;
}

/**
 * Categoriza un doctor en 'pediatric' | 'adult' | 'family' según sus ESP_IDs
 */
function categorizeDoctor(especialidadIds: number[], infoHtml?: string): 'pediatric' | 'adult' | 'family' {
  const nombres = especialidadIds.map(id => ESP_ID_NAMES[id] ?? '').join(' ').toLowerCase();
  const info = stripHtml(infoHtml ?? '').toLowerCase();
  const combined = nombres + ' ' + info;

  // Doctores que atienden a adultos Y niños se clasifican como 'adult'
  if (combined.includes('adultos y niños') || combined.includes('adultos y ni')) {
    return 'adult';
  }
  // Especialidades claramente pediátricas
  if (combined.includes('pediatr') || combined.includes('neonat') ||
      combined.includes('matrona') || combined.includes('lactancia')) {
    return 'pediatric';
  }
  if (combined.includes('famil') || combined.includes('medicina general')) {
    return 'family';
  }
  return 'adult';
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
      await getEspecialidades();
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
  app.get('/api/dricloud/diagnostico', requireAuth, async (_req, res) => {
    try {
      clearTokenCache();
      const doctores = await getDoctores();
      const especialidades = await getEspecialidades();
      res.json({
        estado: 'OK',
        doctoresObtenidos: doctores.length,
        especialidadesObtenidas: especialidades.length,
        endpointUsado: `${getClinicaApiUrl()}/GetDoctores`,
      });
    } catch (err: any) {
      res.json({
        estado: 'ERROR',
        mensaje: err.message,
        endpointUsado: `${getClinicaApiUrl()}/GetEspecialidades`,
      });
    }
  });

  /** POST /api/dricloud/refresh — fuerza reconexión limpiando el token cacheado */
  app.post('/api/dricloud/refresh', requireAuth, async (_req, res) => {
    clearTokenCache();
    try {
      await getEspecialidades();
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
      // Primero intentamos GetEspecialidades; si devuelve vacío derivamos
      // las especialidades reales desde los doctores (que sí llevan ListadoESPECIALIDAD).
      let data = await getEspecialidades();

      if (!data || data.length === 0) {
        // Fallback: derivar especialidades únicas de los ESP_IDs de los doctores
        const doctores = await getDoctores();
        const espMap = new Map<number, { ESP_ID: number; ESP_NOMBRE: string; ListadoTIPO_CITA: [] }>();
        for (const doc of doctores) {
          for (const e of doc.ListadoESPECIALIDAD) {
            const id = (e as any).ESP_ID;
            if (!id || espMap.has(id)) continue;
            // Intentar obtener nombre del campo de información adicional del doctor
            // Si no está disponible, usar el nombre descriptivo de la especialidad conocida
            const nombre = deriveSpecialtyName(id, doc);
            espMap.set(id, { ESP_ID: id, ESP_NOMBRE: nombre, ListadoTIPO_CITA: [] });
          }
        }
        data = Array.from(espMap.values()) as any;
        console.log(`[DriCloud] ✅ ${data.length} especialidades derivadas de doctores`);
      } else {
        console.log(`[DriCloud] ✅ ${data.length} especialidades reales`);
      }

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
        getEspecialidades(),
        getDoctores(espId),
      ]);

      const mapped = doctores
        .filter(doc => {
          // Excluir el registro de la clínica (no es un médico real)
          const info = stripHtml(doc.CITA_ONLINE_MAS_INFO ?? '').toLowerCase();
          return !info.includes('entorno de pruebas') && !info.includes('no acepta citas');
        })
        .map(doc => {
          const espIds = doc.ListadoESPECIALIDAD.map((e: any) => e.ESP_ID);
          const specialty = categorizeDoctor(espIds, doc.CITA_ONLINE_MAS_INFO);
          const mapped = mapDriCloudDoctor(doc, especialidades);
          return {
            id: doc.USU_ID.toString(),
            driCloudId: doc.USU_ID,
            ...mapped,
            specialty, // sobreescribir con categorización mejorada
            especialidadIds: espIds,
            especialidadPrincipalId: espIds[0] ?? null,
            especialidadNombre: ESP_ID_NAMES[espIds[0]] ?? null,
            infoAdicional: stripHtml(doc.CITA_ONLINE_MAS_INFO ?? ''),
          };
        });
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

  /** GET /api/dricloud/patients — phone is always taken from the session, never from query params */
  app.get('/api/dricloud/patients', requireAuth, async (req, res) => {
    // Ownership: ignore any client-supplied telefono; use the authenticated session phone.
    const sessionPhone = normalizePhone(req.session!.user!.phone);
    try {
      const result = await getPacientesPorTelefono(sessionPhone);
      res.json(result.Pacientes ?? []);
    } catch (err) {
      console.error('[DriCloud] Error en /patients:', err);
      res.status(502).json({ error: 'Error al buscar pacientes' });
    }
  });

  // ── Citas ──────────────────────────────────────────────────────────────────

  /** POST /api/dricloud/appointments — crea una cita */
  app.post('/api/dricloud/appointments', requireAuth, async (req, res) => {
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

    // Ownership check: the patientPhone in the body must match the authenticated session.
    const sessionPhone = normalizePhone(req.session!.user!.phone);
    if (!sessionPhone || normalizePhone(patientPhone) !== sessionPhone) {
      return res.status(403).json({
        error: 'El teléfono no coincide con el de tu cuenta. Usa el mismo teléfono con el que iniciaste sesión.',
      });
    }

    const { nombre, apellidos } = splitFullName(patientName);
    let fechaCita: string;
    try {
      fechaCita = naiveLocalStringToDateTimeForDriCloud(appointmentDate);
    } catch {
      return res.status(400).json({ error: 'Formato de fecha de cita inválido.' });
    }

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
          PAC_FECHA_NACIMIENTO: formatBirthDateForDriCloud(nacimiento),
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
  app.put('/api/dricloud/appointments/:id', requireAuth, async (req, res) => {
    const cpaId = parseInt(req.params.id);
    const { appointmentDate, minutos } = req.body;

    if (!appointmentDate) return res.status(400).json({ error: 'Se requiere appointmentDate' });

    const sessionPhone = normalizePhone(req.session!.user!.phone);

    // Ownership check: fetch the appointment before mutating.
    // If the lookup fails, refuse the mutation — do not fall through silently.
    let cita: Awaited<ReturnType<typeof getCitaById>>;
    try {
      cita = await getCitaById(cpaId);
    } catch (err) {
      console.error('[DriCloud] Error al verificar propiedad de la cita (PUT):', err);
      return res.status(503).json({ error: 'No se pudo verificar la identidad de la cita' });
    }

    if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });

    const citaPhone = normalizePhone(cita.PAC_TELEFONO1 ?? '');
    if (!citaPhone || citaPhone !== sessionPhone) {
      return res.status(403).json({
        error: 'El teléfono no coincide con el de tu cuenta. Usa el mismo teléfono con el que iniciaste sesión.',
      });
    }

    let fechaCita: string;
    try {
      fechaCita = naiveLocalStringToDateTimeForDriCloud(appointmentDate);
    } catch {
      return res.status(400).json({ error: 'Formato de fecha de cita inválido.' });
    }
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
  app.post('/api/dricloud/appointments/:id/cancel', requireAuth, async (req, res) => {
    const cpaId = parseInt(req.params.id);
    if (isNaN(cpaId)) return res.status(400).json({ error: 'ID de cita inválido' });

    const sessionPhone = normalizePhone(req.session!.user!.phone);

    // Ownership check: fetch the appointment before deleting.
    // If the lookup fails, refuse the deletion — do not fall through silently.
    let cita: Awaited<ReturnType<typeof getCitaById>>;
    try {
      cita = await getCitaById(cpaId);
    } catch (err) {
      console.error('[DriCloud] Error al verificar propiedad de la cita (cancel):', err);
      return res.status(503).json({ error: 'No se pudo verificar la identidad de la cita' });
    }

    if (!cita) return res.status(404).json({ error: 'Cita no encontrada' });

    const citaPhone = normalizePhone(cita.PAC_TELEFONO1 ?? '');
    if (!citaPhone || citaPhone !== sessionPhone) {
      return res.status(403).json({
        error: 'El teléfono no coincide con el de tu cuenta. Usa el mismo teléfono con el que iniciaste sesión.',
      });
    }

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
  app.get('/api/dricloud/appointments', requireAuth, async (req, res) => {
    const { nif, fechaInicio, fechaFin, usuId } = req.query;
    if (!nif) return res.status(400).json({ error: 'Se requiere nif del paciente' });

    const sessionPhone = normalizePhone(req.session!.user!.phone);

    // Phase 1: ownership check — must complete successfully before any data is returned.
    // If the upstream lookup fails for any reason, the ownership check cannot be
    // evaluated and we must NOT fall through to a successful (200) response.
    let pacienteResult: Awaited<ReturnType<typeof getPacienteByNIF>>;
    try {
      pacienteResult = await getPacienteByNIF(nif as string);
    } catch (err) {
      console.error('[DriCloud] Error al verificar propiedad del paciente:', err);
      return res.status(503).json({ error: 'No se pudo verificar la identidad del paciente' });
    }

    if (!pacienteResult.Exists) {
      return res.status(404).json({ error: 'Paciente no encontrado' });
    }

    const patientPhone = normalizePhone(pacienteResult.Paciente.PAC_TELEFONO1);
    // Guard: reject empty patient phone to prevent false '' === '' matches.
    if (!patientPhone || patientPhone !== sessionPhone) {
      return res.status(403).json({
        error: 'El teléfono no coincide con el de tu cuenta. Usa el mismo teléfono con el que iniciaste sesión.',
      });
    }

    // Phase 2: ownership confirmed — fetch the actual appointment data.
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
