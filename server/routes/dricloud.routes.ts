import type { Express } from 'express';
import {
  getEspecialidades,
  getDoctores,
  getAgendaDisponibilidad,
  getPacientePorNombreTelefono,
  createPaciente,
  createCita,
  cancelCita
} from '../dricloud/services';
import {
  mapDriCloudDoctor,
  formatDateForDriCloud,
  formatDateTimeForDriCloud,
  parseDisponibilidad,
  splitFullName
} from '../dricloud/mapper';
import { DRICLOUD_CONFIG, clearTokenCache } from '../dricloud/auth';
import {
  mockEspecialidades,
  mockDoctores,
  generateMockAvailability,
  createMockAppointment,
  createMockPatient,
  findMockPatient
} from '../dricloud/mock-data';

/**
 * Verifica si la respuesta indica que la suscripción no está activa
 */
function isSubscriptionError(data: any): boolean {
  if (!data || typeof data !== 'object') return false;
  
  // Verificar si es un error de suscripción
  if (data.Successful === false && typeof data.Html === 'string') {
    const html = data.Html.toLowerCase();
    return html.includes('suscripción') || html.includes('suscripcion');
  }
  
  return false;
}

// Middleware para deshabilitar caché en todos los endpoints DriCloud
function noCache(req: any, res: any, next: any) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}

export function registerDriCloudRoutes(app: Express) {

  // Aplicar no-cache a todas las rutas DriCloud
  app.use('/api/dricloud', noCache);

  /**
   * GET /api/dricloud/diagnostico
   * Devuelve la respuesta RAW de DriCloud para diagnóstico
   */
  app.get('/api/dricloud/diagnostico', async (req, res) => {
    try {
      clearTokenCache();
      const rawEspecialidades = await getEspecialidades(DRICLOUD_CONFIG.clinicaId);
      res.json({
        configuracion: {
          urlClinica: DRICLOUD_CONFIG.urlClinica,
          clinicaId: DRICLOUD_CONFIG.clinicaId,
          endpointUsado: `https://apidricloud.dricloud.net/${DRICLOUD_CONFIG.urlClinica}/api/APIWeb/GetEspecialidades`,
        },
        respuestaDriCloud: rawEspecialidades,
        interpretacion: isSubscriptionError(rawEspecialidades)
          ? 'ERROR: DriCloud indica que la suscripción WebAPI no está activa'
          : Array.isArray(rawEspecialidades)
            ? `OK: Se obtuvieron ${(rawEspecialidades as any[]).length} especialidades reales`
            : 'DESCONOCIDO: Respuesta inesperada'
      });
    } catch (error: any) {
      res.status(500).json({
        error: 'Error al conectar con DriCloud',
        detalle: error.message
      });
    }
  });

  /**
   * POST /api/dricloud/refresh
   * Limpia el token cacheado y fuerza reconexión con DriCloud
   */
  app.post('/api/dricloud/refresh', async (req, res) => {
    try {
      clearTokenCache();
      // Hacer una petición de prueba para verificar que funciona
      const especialidades = await getEspecialidades(DRICLOUD_CONFIG.clinicaId);
      const isDemoMode = isSubscriptionError(especialidades);

      console.log('[DriCloud] Refresh manual - isDemoMode:', isDemoMode);

      res.json({
        success: true,
        isDemoMode,
        message: isDemoMode
          ? 'Reconectado - Suscripción WebAPI no activa'
          : 'Reconectado a DriCloud con éxito'
      });
    } catch (error) {
      console.error('[DriCloud] Error en refresh:', error);
      res.status(500).json({ success: false, error: 'Error al reconectar con DriCloud' });
    }
  });

  /**
   * GET /api/dricloud/status
   * Verifica si DriCloud está en modo demo o producción
   */
  app.get('/api/dricloud/status', async (req, res) => {
    try {
      const especialidades = await getEspecialidades(DRICLOUD_CONFIG.clinicaId);
      const isDemoMode = isSubscriptionError(especialidades);
      
      if (isDemoMode) {
        console.log('[DriCloud] Status: Modo demostración - Suscripción no activa');
        return res.json({ 
          isDemoMode: true,
          message: 'Modo demostración activo - Suscripción DriCloud no activa'
        });
      }
      
      // Verificar que realmente obtuvimos datos válidos
      if (Array.isArray(especialidades) && especialidades.length > 0) {
        console.log('[DriCloud] Status: Conectado a DriCloud - Datos reales disponibles');
        return res.json({ 
          isDemoMode: false,
          message: 'Conectado a DriCloud'
        });
      }
      
      // Si llegamos aquí, algo está mal pero no es el error de suscripción
      console.warn('[DriCloud] Status: Respuesta inesperada, asumiendo modo producción con error temporal');
      res.status(500).json({ 
        error: 'Error inesperado al verificar estado DriCloud'
      });
      
    } catch (error) {
      console.error('[DriCloud] Status: Error de conexión:', error);
      // No asumir demo mode en errores de red/conexión
      res.status(500).json({ 
        error: 'Error de conexión con DriCloud'
      });
    }
  });
  
  /**
   * GET /api/dricloud/specialties
   * Obtiene las especialidades de DriCloud o datos demo
   */
  app.get('/api/dricloud/specialties', async (req, res) => {
    try {
      const especialidades = await getEspecialidades(DRICLOUD_CONFIG.clinicaId);
      
      // Si hay error de suscripción, usar datos demo
      if (isSubscriptionError(especialidades)) {
        console.log('[DriCloud] ⚠️  Suscripción no activa - Usando datos de demostración');
        return res.json(mockEspecialidades);
      }
      
      if (Array.isArray(especialidades)) {
        console.log('[DriCloud] ✅ Especialidades reales obtenidas:', especialidades.length);
        res.json(especialidades);
      } else {
        console.log('[DriCloud] ⚠️  Respuesta inesperada - Usando datos de demostración');
        res.json(mockEspecialidades);
      }
    } catch (error) {
      console.error('[DriCloud] Error fetching specialties:', error);
      console.log('[DriCloud] ⚠️  Error - Usando datos de demostración');
      res.json(mockEspecialidades);
    }
  });

  /**
   * GET /api/dricloud/doctors
   * Obtiene los doctores desde DriCloud o datos demo
   */
  app.get('/api/dricloud/doctors', async (req, res) => {
    try {
      const { especialidadId } = req.query;
      
      // Intentar obtener datos reales
      const especialidades = await getEspecialidades(DRICLOUD_CONFIG.clinicaId);
      const doctores = await getDoctores(especialidadId ? parseInt(especialidadId as string) : undefined);
      
      // Si hay error de suscripción en especialidades o doctores, usar datos demo
      if (isSubscriptionError(especialidades) || isSubscriptionError(doctores)) {
        console.log('[DriCloud] ⚠️  Suscripción no activa - Usando doctores de demostración');
        
        let filteredDoctors = mockDoctores;
        if (especialidadId) {
          const espId = parseInt(especialidadId as string);
          filteredDoctors = mockDoctores.filter(doc => 
            doc.ListadoESPECIALIDAD.some(esp => esp.ESP_ID === espId)
          );
        }
        
        const mappedDoctors = filteredDoctors.map(doc => ({
          id: doc.USU_ID.toString(),
          ...mapDriCloudDoctor(doc, mockEspecialidades),
          driCloudId: doc.USU_ID
        }));
        
        return res.json(mappedDoctors);
      }
      
      // Verificar si doctores es un array
      if (!Array.isArray(doctores)) {
        console.log('[DriCloud] ⚠️  Respuesta inesperada - Usando doctores de demostración');
        const mappedDoctors = mockDoctores.map(doc => ({
          id: doc.USU_ID.toString(),
          ...mapDriCloudDoctor(doc, mockEspecialidades),
          driCloudId: doc.USU_ID
        }));
        return res.json(mappedDoctors);
      }
      
      // Datos reales obtenidos exitosamente
      console.log('[DriCloud] ✅ Doctores reales obtenidos:', doctores.length);
      const mappedDoctors = doctores.map(doc => ({
        id: doc.USU_ID.toString(),
        ...mapDriCloudDoctor(doc, especialidades as any),
        driCloudId: doc.USU_ID
      }));
      
      res.json(mappedDoctors);
    } catch (error) {
      console.error('[DriCloud] Error fetching doctors:', error);
      console.log('[DriCloud] ⚠️  Error - Usando doctores de demostración');
      
      const mappedDoctors = mockDoctores.map(doc => ({
        id: doc.USU_ID.toString(),
        ...mapDriCloudDoctor(doc, mockEspecialidades),
        driCloudId: doc.USU_ID
      }));
      res.json(mappedDoctors);
    }
  });

  /**
   * GET /api/dricloud/availability
   * Obtiene la disponibilidad de agenda de un doctor o datos demo
   */
  app.get('/api/dricloud/availability', async (req, res) => {
    try {
      const { doctorId, fecha, diasRecuperar = '7' } = req.query;
      
      if (!doctorId || !fecha) {
        return res.status(400).json({ error: 'doctorId y fecha son requeridos' });
      }
      
      // Intentar obtener disponibilidad real
      const disponibilidad = await getAgendaDisponibilidad(
        parseInt(doctorId as string),
        fecha as string,
        undefined,
        DRICLOUD_CONFIG.clinicaId,
        undefined,
        undefined,
        parseInt(diasRecuperar as string)
      );
      
      // Si hay error de suscripción, generar datos demo
      if (isSubscriptionError(disponibilidad)) {
        console.log('[DriCloud] ⚠️  Suscripción no activa - Generando disponibilidad de demostración');
        
        const startDate = new Date(
          parseInt(fecha.toString().substring(0, 4)),
          parseInt(fecha.toString().substring(4, 6)) - 1,
          parseInt(fecha.toString().substring(6, 8))
        );
        
        const mockSlots = generateMockAvailability(
          parseInt(doctorId as string),
          startDate,
          parseInt(diasRecuperar as string)
        );
        
        const slots = mockSlots.map(parseDisponibilidad);
        return res.json(slots);
      }
      
      // Datos reales obtenidos
      if (disponibilidad.Disponibilidad && Array.isArray(disponibilidad.Disponibilidad)) {
        console.log('[DriCloud] ✅ Disponibilidad real obtenida:', disponibilidad.Disponibilidad.length, 'slots');
        const slots = disponibilidad.Disponibilidad.map(parseDisponibilidad);
        res.json(slots);
      } else {
        console.log('[DriCloud] ⚠️  Respuesta inesperada - Generando disponibilidad de demostración');
        const startDate = new Date(
          parseInt(fecha.toString().substring(0, 4)),
          parseInt(fecha.toString().substring(4, 6)) - 1,
          parseInt(fecha.toString().substring(6, 8))
        );
        const mockSlots = generateMockAvailability(
          parseInt(doctorId as string),
          startDate,
          parseInt(diasRecuperar as string)
        );
        const slots = mockSlots.map(parseDisponibilidad);
        res.json(slots);
      }
    } catch (error) {
      console.error('[DriCloud] Error fetching availability:', error);
      console.log('[DriCloud] ⚠️  Error - Generando disponibilidad de demostración');
      
      const startDate = new Date(
        parseInt(req.query.fecha!.toString().substring(0, 4)),
        parseInt(req.query.fecha!.toString().substring(4, 6)) - 1,
        parseInt(req.query.fecha!.toString().substring(6, 8))
      );
      const mockSlots = generateMockAvailability(
        parseInt(req.query.doctorId as string),
        startDate,
        parseInt(req.query.diasRecuperar as string || '7')
      );
      const slots = mockSlots.map(parseDisponibilidad);
      res.json(slots);
    }
  });

  /**
   * POST /api/dricloud/appointments
   * Crea una cita en DriCloud o modo demo
   */
  app.post('/api/dricloud/appointments', async (req, res) => {
    try {
      const {
        doctorId,
        patientName,
        patientEmail,
        patientPhone,
        patientAge,
        appointmentDate,
        specialtyName,
        notes
      } = req.body;
      
      // Validar datos requeridos
      if (!doctorId || !patientName || !patientPhone || !appointmentDate) {
        return res.status(400).json({ 
          error: 'Faltan datos requeridos: doctorId, patientName, patientPhone, appointmentDate' 
        });
      }
      
      // Intentar crear en DriCloud
      try {
        const { nombre, apellidos } = splitFullName(patientName);
        let pacienteId: number;
        
        // Buscar o crear paciente
        const pacienteExistente = await getPacientePorNombreTelefono(
          nombre,
          apellidos,
          patientPhone
        );
        
        // Si hay error de suscripción, usar modo demo
        if (isSubscriptionError(pacienteExistente)) {
          console.log('[DriCloud] ⚠️  Suscripción no activa - Creando cita en modo demostración');
          
          const mockPatientId = createMockPatient({
            nombre,
            apellidos,
            telefono: patientPhone,
            email: patientEmail || '',
            fechaNacimiento: new Date(Date.now() - (patientAge || 30) * 365 * 24 * 60 * 60 * 1000).toISOString()
          });
          
          const mockAppointmentId = createMockAppointment({
            patientName,
            doctorId: parseInt(doctorId),
            datetime: appointmentDate,
            specialty: specialtyName || 'General'
          });
          
          return res.status(201).json({
            citaId: mockAppointmentId,
            pacienteId: mockPatientId,
            message: 'Cita creada en modo demostración (DriCloud suscripción no activa)',
            isDemoMode: true
          });
        }
        
        if (pacienteExistente.Exists) {
          pacienteId = pacienteExistente.Paciente.PAC_ID;
          console.log('[DriCloud] Paciente existente encontrado:', pacienteId);
        } else {
          const fechaNacimiento = new Date();
          fechaNacimiento.setFullYear(fechaNacimiento.getFullYear() - (patientAge || 30));
          
          const nuevoPaciente = await createPaciente({
            PAC_NOMBRE: nombre,
            PAC_APELLIDOS: apellidos,
            PAC_TELEFONO1: patientPhone,
            PAC_EMAIL: patientEmail || '',
            PAC_FECHA_NACIMIENTO: fechaNacimiento.toISOString().split('T')[0],
            PAC_SEXO_ID: 0
          });
          
          // Si hay error de suscripción al crear paciente
          if (isSubscriptionError(nuevoPaciente)) {
            console.log('[DriCloud] ⚠️  Error al crear paciente - Usando modo demostración');
            const mockPatientId = createMockPatient({
              nombre,
              apellidos,
              telefono: patientPhone,
              email: patientEmail || '',
              fechaNacimiento: new Date(Date.now() - (patientAge || 30) * 365 * 24 * 60 * 60 * 1000).toISOString()
            });
            
            const mockAppointmentId = createMockAppointment({
              patientName,
              doctorId: parseInt(doctorId),
              datetime: appointmentDate,
              specialty: specialtyName || 'General'
            });
            
            return res.status(201).json({
              citaId: mockAppointmentId,
              pacienteId: mockPatientId,
              message: 'Cita creada en modo demostración',
              isDemoMode: true
            });
          }
          
          pacienteId = nuevoPaciente.PAC_ID;
          console.log('[DriCloud] Nuevo paciente creado:', pacienteId);
        }
        
        // Crear la cita
        const fechaCita = formatDateTimeForDriCloud(new Date(appointmentDate));
        
        const cita = await createCita(
          parseInt(doctorId),
          fechaCita,
          pacienteId,
          undefined,
          undefined,
          DRICLOUD_CONFIG.clinicaId,
          notes
        );
        
        // Si hay error de suscripción al crear cita
        if (isSubscriptionError(cita)) {
          console.log('[DriCloud] ⚠️  Error al crear cita - Usando modo demostración');
          const mockAppointmentId = createMockAppointment({
            patientName,
            doctorId: parseInt(doctorId),
            datetime: appointmentDate,
            specialty: specialtyName || 'General'
          });
          
          return res.status(201).json({
            citaId: mockAppointmentId,
            pacienteId: pacienteId,
            message: 'Cita creada en modo demostración',
            isDemoMode: true
          });
        }
        
        console.log('[DriCloud] ✅ Cita creada exitosamente en DriCloud:', cita.CPA_ID);
        
        res.status(201).json({
          citaId: cita.CPA_ID,
          pacienteId: pacienteId,
          message: 'Cita creada exitosamente en DriCloud',
          isDemoMode: false
        });
        
      } catch (innerError) {
        console.error('[DriCloud] Error en proceso de cita:', innerError);
        
        // Fallback a modo demo
        const { nombre, apellidos } = splitFullName(patientName);
        const mockPatientId = createMockPatient({
          nombre,
          apellidos,
          telefono: patientPhone,
          email: patientEmail || '',
          fechaNacimiento: new Date(Date.now() - (patientAge || 30) * 365 * 24 * 60 * 60 * 1000).toISOString()
        });
        
        const mockAppointmentId = createMockAppointment({
          patientName,
          doctorId: parseInt(doctorId),
          datetime: appointmentDate,
          specialty: specialtyName || 'General'
        });
        
        res.status(201).json({
          citaId: mockAppointmentId,
          pacienteId: mockPatientId,
          message: 'Cita creada en modo demostración',
          isDemoMode: true
        });
      }
      
    } catch (error) {
      console.error('[DriCloud] Error creating appointment:', error);
      res.status(500).json({ error: 'Error al crear la cita' });
    }
  });

  /**
   * POST /api/dricloud/appointments/:id/cancel
   * Cancela una cita en DriCloud o modo demo
   */
  app.post('/api/dricloud/appointments/:id/cancel', async (req, res) => {
    try {
      const citaId = parseInt(req.params.id);
      
      if (isNaN(citaId)) {
        return res.status(400).json({ error: 'ID de cita inválido' });
      }
      
      const result = await cancelCita(citaId);
      
      // Si hay error de suscripción
      if (isSubscriptionError(result)) {
        console.log('[DriCloud] ⚠️  Suscripción no activa - Cancelación en modo demostración');
        return res.json({
          success: true,
          message: 'Cita cancelada en modo demostración',
          isDemoMode: true
        });
      }
      
      console.log('[DriCloud] ✅ Cita cancelada en DriCloud:', citaId);
      
      res.json({
        success: result.success,
        message: 'Cita cancelada exitosamente en DriCloud',
        isDemoMode: false
      });
      
    } catch (error) {
      console.error('[DriCloud] Error cancelling appointment:', error);
      // Fallback a modo demo
      res.json({
        success: true,
        message: 'Cita cancelada en modo demostración',
        isDemoMode: true
      });
    }
  });
}
