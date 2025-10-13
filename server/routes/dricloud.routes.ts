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
import { DRICLOUD_CONFIG } from '../dricloud/auth';

export function registerDriCloudRoutes(app: Express) {
  
  /**
   * GET /api/dricloud/doctors
   * Obtiene los doctores desde DriCloud
   */
  app.get('/api/dricloud/doctors', async (req, res) => {
    try {
      const { especialidadId } = req.query;
      
      // Primero obtener especialidades para mapear
      const especialidades = await getEspecialidades(DRICLOUD_CONFIG.clinicaId);
      
      // Luego obtener doctores
      const doctores = await getDoctores(especialidadId ? parseInt(especialidadId as string) : undefined);
      
      console.log('[DriCloud] Doctores recibidos:', typeof doctores, Array.isArray(doctores));
      
      // Verificar si doctores es un array
      if (!Array.isArray(doctores)) {
        console.error('[DriCloud] La respuesta de doctores no es un array:', doctores);
        return res.json([]);
      }
      
      // Mapear a nuestro formato
      const mappedDoctors = doctores.map(doc => ({
        id: doc.USU_ID.toString(),
        ...mapDriCloudDoctor(doc, especialidades),
        driCloudId: doc.USU_ID
      }));
      
      res.json(mappedDoctors);
    } catch (error) {
      console.error('[DriCloud] Error fetching doctors:', error);
      res.status(500).json({ error: 'Error al obtener los doctores' });
    }
  });

  /**
   * GET /api/dricloud/availability
   * Obtiene la disponibilidad de agenda de un doctor
   */
  app.get('/api/dricloud/availability', async (req, res) => {
    try {
      const { doctorId, fecha, diasRecuperar = '7' } = req.query;
      
      if (!doctorId || !fecha) {
        return res.status(400).json({ error: 'doctorId y fecha son requeridos' });
      }
      
      const disponibilidad = await getAgendaDisponibilidad(
        parseInt(doctorId as string),
        fecha as string,
        undefined,
        DRICLOUD_CONFIG.clinicaId,
        undefined,
        undefined,
        parseInt(diasRecuperar as string)
      );
      
      // Parsear y transformar la disponibilidad
      const slots = disponibilidad.Disponibilidad.map(parseDisponibilidad);
      
      res.json(slots);
    } catch (error) {
      console.error('[DriCloud] Error fetching availability:', error);
      res.status(500).json({ error: 'Error al obtener la disponibilidad' });
    }
  });

  /**
   * POST /api/dricloud/appointments
   * Crea una cita en DriCloud
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
        notes
      } = req.body;
      
      // Validar datos requeridos
      if (!doctorId || !patientName || !patientPhone || !appointmentDate) {
        return res.status(400).json({ 
          error: 'Faltan datos requeridos: doctorId, patientName, patientPhone, appointmentDate' 
        });
      }
      
      // Buscar o crear paciente
      const { nombre, apellidos } = splitFullName(patientName);
      let pacienteId: number;
      
      try {
        const pacienteExistente = await getPacientePorNombreTelefono(
          nombre,
          apellidos,
          patientPhone
        );
        
        if (pacienteExistente.Exists) {
          pacienteId = pacienteExistente.Paciente.PAC_ID;
          console.log('[DriCloud] Paciente existente encontrado:', pacienteId);
        } else {
          // Crear nuevo paciente
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
          
          pacienteId = nuevoPaciente.PAC_ID;
          console.log('[DriCloud] Nuevo paciente creado:', pacienteId);
        }
      } catch (error) {
        console.error('[DriCloud] Error gestionando paciente:', error);
        throw new Error('Error al gestionar el paciente');
      }
      
      // Crear la cita
      const fechaCita = formatDateTimeForDriCloud(new Date(appointmentDate));
      
      const cita = await createCita(
        parseInt(doctorId),
        fechaCita,
        pacienteId,
        undefined, // TCI_ID
        undefined, // DES_ID
        DRICLOUD_CONFIG.clinicaId,
        notes
      );
      
      console.log('[DriCloud] Cita creada exitosamente:', cita.CPA_ID);
      
      res.status(201).json({
        citaId: cita.CPA_ID,
        pacienteId: pacienteId,
        message: 'Cita creada exitosamente en DriCloud'
      });
      
    } catch (error) {
      console.error('[DriCloud] Error creating appointment:', error);
      res.status(500).json({ error: 'Error al crear la cita en DriCloud' });
    }
  });

  /**
   * POST /api/dricloud/appointments/:id/cancel
   * Cancela una cita en DriCloud
   */
  app.post('/api/dricloud/appointments/:id/cancel', async (req, res) => {
    try {
      const citaId = parseInt(req.params.id);
      
      if (isNaN(citaId)) {
        return res.status(400).json({ error: 'ID de cita inválido' });
      }
      
      const result = await cancelCita(citaId);
      
      console.log('[DriCloud] Cita cancelada:', citaId);
      
      res.json({
        success: result.success,
        message: 'Cita cancelada exitosamente en DriCloud'
      });
      
    } catch (error) {
      console.error('[DriCloud] Error cancelling appointment:', error);
      res.status(500).json({ error: 'Error al cancelar la cita en DriCloud' });
    }
  });

  /**
   * GET /api/dricloud/specialties
   * Obtiene las especialidades de DriCloud
   */
  app.get('/api/dricloud/specialties', async (req, res) => {
    try {
      const especialidades = await getEspecialidades(DRICLOUD_CONFIG.clinicaId);
      res.json(especialidades);
    } catch (error) {
      console.error('[DriCloud] Error fetching specialties:', error);
      res.status(500).json({ error: 'Error al obtener las especialidades' });
    }
  });
}
