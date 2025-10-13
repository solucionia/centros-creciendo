import type { DriCloudEspecialidad, DriCloudDoctor, DriCloudPaciente } from './services';

/**
 * Datos de demostración para CitaFacil
 * Se usan cuando la suscripción de DriCloud WebAPI no está activa
 */

export const mockEspecialidades: DriCloudEspecialidad[] = [
  {
    ESP_ID: 1,
    ESP_NOMBRE: "Medicina General",
    ListadoTIPO_CITA: [
      {
        TCI_ID: 1,
        TCI_NOMBRE: "Consulta General",
        TCI_MINUTOS_CITA: 30,
        ImportePrivado: 50
      },
      {
        TCI_ID: 2,
        TCI_NOMBRE: "Consulta de Seguimiento",
        TCI_MINUTOS_CITA: 20,
        ImportePrivado: 35
      }
    ]
  },
  {
    ESP_ID: 2,
    ESP_NOMBRE: "Pediatría",
    ListadoTIPO_CITA: [
      {
        TCI_ID: 3,
        TCI_NOMBRE: "Consulta Pediátrica",
        TCI_MINUTOS_CITA: 30,
        ImportePrivado: 55
      },
      {
        TCI_ID: 4,
        TCI_NOMBRE: "Control de Niño Sano",
        TCI_MINUTOS_CITA: 20,
        ImportePrivado: 40
      }
    ]
  },
  {
    ESP_ID: 3,
    ESP_NOMBRE: "Cardiología",
    ListadoTIPO_CITA: [
      {
        TCI_ID: 5,
        TCI_NOMBRE: "Consulta Cardiológica",
        TCI_MINUTOS_CITA: 40,
        ImportePrivado: 80
      },
      {
        TCI_ID: 6,
        TCI_NOMBRE: "Electrocardiograma",
        TCI_MINUTOS_CITA: 30,
        ImportePrivado: 60
      }
    ]
  },
  {
    ESP_ID: 4,
    ESP_NOMBRE: "Dermatología",
    ListadoTIPO_CITA: [
      {
        TCI_ID: 7,
        TCI_NOMBRE: "Consulta Dermatológica",
        TCI_MINUTOS_CITA: 30,
        ImportePrivado: 65
      }
    ]
  },
  {
    ESP_ID: 5,
    ESP_NOMBRE: "Psicología",
    ListadoTIPO_CITA: [
      {
        TCI_ID: 8,
        TCI_NOMBRE: "Terapia Individual",
        TCI_MINUTOS_CITA: 60,
        ImportePrivado: 70
      },
      {
        TCI_ID: 9,
        TCI_NOMBRE: "Evaluación Psicológica",
        TCI_MINUTOS_CITA: 90,
        ImportePrivado: 100
      }
    ]
  }
];

export const mockDoctores: DriCloudDoctor[] = [
  {
    USU_ID: 1,
    USU_NOMBRE: "María",
    USU_APELLIDOS: "García López",
    USU_EMAIL: "m.garcia@citafacil.com",
    ListadoESPECIALIDAD: [{ ESP_ID: 1 }],
    USU_DOC_COLEGIADO: "28/28/12345",
    CITA_ONLINE_MAS_INFO: "Especialista en medicina familiar y preventiva"
  },
  {
    USU_ID: 2,
    USU_NOMBRE: "Carlos",
    USU_APELLIDOS: "Rodríguez Sánchez",
    USU_EMAIL: "c.rodriguez@citafacil.com",
    ListadoESPECIALIDAD: [{ ESP_ID: 2 }],
    USU_DOC_COLEGIADO: "28/28/23456",
    CITA_ONLINE_MAS_INFO: "Pediatra con 15 años de experiencia"
  },
  {
    USU_ID: 3,
    USU_NOMBRE: "Ana",
    USU_APELLIDOS: "Martínez Fernández",
    USU_EMAIL: "a.martinez@citafacil.com",
    ListadoESPECIALIDAD: [{ ESP_ID: 3 }],
    USU_DOC_COLEGIADO: "28/28/34567",
    CITA_ONLINE_MAS_INFO: "Cardióloga especializada en prevención cardiovascular"
  },
  {
    USU_ID: 4,
    USU_NOMBRE: "Luis",
    USU_APELLIDOS: "González Pérez",
    USU_EMAIL: "l.gonzalez@citafacil.com",
    ListadoESPECIALIDAD: [{ ESP_ID: 4 }],
    USU_DOC_COLEGIADO: "28/28/45678",
    CITA_ONLINE_MAS_INFO: "Dermatólogo experto en dermatología estética y médica"
  },
  {
    USU_ID: 5,
    USU_NOMBRE: "Elena",
    USU_APELLIDOS: "Torres Ruiz",
    USU_EMAIL: "e.torres@citafacil.com",
    ListadoESPECIALIDAD: [{ ESP_ID: 5 }],
    USU_DOC_COLEGIADO: "28/28/56789",
    CITA_ONLINE_MAS_INFO: "Psicóloga clínica especializada en terapia cognitivo-conductual"
  },
  {
    USU_ID: 6,
    USU_NOMBRE: "Javier",
    USU_APELLIDOS: "Hernández Castro",
    USU_EMAIL: "j.hernandez@citafacil.com",
    ListadoESPECIALIDAD: [{ ESP_ID: 1 }, { ESP_ID: 3 }],
    USU_DOC_COLEGIADO: "28/28/67890",
    CITA_ONLINE_MAS_INFO: "Médico general con formación en cardiología"
  }
];

/**
 * Genera disponibilidad mock para un doctor
 */
export function generateMockAvailability(doctorId: number, startDate: Date, days: number = 7): string[] {
  const availability: string[] = [];
  const currentDate = new Date(startDate);
  
  for (let day = 0; day < days; day++) {
    const dateStr = formatDateForDriCloud(currentDate);
    
    // Horarios de mañana (9:00 - 13:00)
    if (currentDate.getDay() !== 0) { // No domingo
      for (let hour = 9; hour < 13; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const timeStr = `${dateStr}${hour.toString().padStart(2, '0')}${minute.toString().padStart(2, '0')}`;
          availability.push(`${timeStr}:30:1`); // 30 minutos, DES_ID = 1
        }
      }
    }
    
    // Horarios de tarde (16:00 - 19:00) - solo lunes a jueves
    if (currentDate.getDay() > 0 && currentDate.getDay() < 5) {
      for (let hour = 16; hour < 19; hour++) {
        for (let minute = 0; minute < 60; minute += 30) {
          const timeStr = `${dateStr}${hour.toString().padStart(2, '0')}${minute.toString().padStart(2, '0')}`;
          availability.push(`${timeStr}:30:1`);
        }
      }
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return availability;
}

/**
 * Formatea fecha para DriCloud (yyyyMMdd)
 */
function formatDateForDriCloud(date: Date): string {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Almacén temporal de citas mock
 */
export const mockAppointments = new Map<number, {
  id: number;
  patientName: string;
  doctorId: number;
  datetime: string;
  specialty: string;
}>();

let nextAppointmentId = 1000;

/**
 * Crea una cita mock
 */
export function createMockAppointment(data: {
  patientName: string;
  doctorId: number;
  datetime: string;
  specialty: string;
}): number {
  const id = nextAppointmentId++;
  mockAppointments.set(id, { id, ...data });
  return id;
}

/**
 * Busca paciente mock (siempre devuelve que no existe para permitir creación)
 */
export function findMockPatient(phone: string): DriCloudPaciente | null {
  // Siempre devuelve null para simular que el paciente no existe y debe crearse
  return null;
}

/**
 * Crea un paciente mock
 */
export function createMockPatient(data: {
  nombre: string;
  apellidos: string;
  telefono: string;
  email: string;
  fechaNacimiento: string;
}): number {
  // Genera un ID único basado en timestamp
  return Date.now() % 1000000;
}
