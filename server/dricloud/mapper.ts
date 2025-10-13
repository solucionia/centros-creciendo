import type { Doctor, InsertDoctor } from '@shared/schema';
import type { DriCloudDoctor, DriCloudEspecialidad } from './services';

/**
 * Mapea las especialidades de DriCloud a nuestro formato interno
 */
export function mapDriCloudSpecialty(especialidad: string): 'pediatric' | 'adult' | 'family' {
  const lower = especialidad.toLowerCase();
  
  if (lower.includes('pediatr') || lower.includes('pedia')) {
    return 'pediatric';
  } else if (lower.includes('famil')) {
    return 'family';
  } else {
    return 'adult';
  }
}

/**
 * Mapea un doctor de DriCloud a nuestro formato interno
 */
export function mapDriCloudDoctor(
  driDoctor: DriCloudDoctor,
  especialidades: DriCloudEspecialidad[]
): InsertDoctor {
  // Obtener la primera especialidad del doctor
  const espId = driDoctor.ListadoESPECIALIDAD[0]?.ESP_ID;
  const especialidad = especialidades.find(e => e.ESP_ID === espId);
  
  let specialty: 'pediatric' | 'adult' | 'family' = 'adult';
  if (especialidad) {
    specialty = mapDriCloudSpecialty(especialidad.ESP_NOMBRE);
  }

  return {
    name: `${driDoctor.USU_NOMBRE} ${driDoctor.USU_APELLIDOS}`,
    specialty: specialty,
    email: driDoctor.USU_EMAIL || `doctor${driDoctor.USU_ID}@dricloud.com`,
    phone: driDoctor.USU_DOC_COLEGIADO || null,
    photoUrl: driDoctor.FotoPerfil ? `data:image/jpeg;base64,${driDoctor.FotoPerfil}` : null
  };
}

/**
 * Formatea una fecha para DriCloud (yyyyMMdd)
 */
export function formatDateForDriCloud(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

/**
 * Formatea una fecha y hora para DriCloud (yyyyMMddHHmm)
 */
export function formatDateTimeForDriCloud(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}`;
}

/**
 * Parsea la disponibilidad de DriCloud
 * Formato: "yyyyMMddHHmm:<MinCita>:<DES_ID>"
 */
export function parseDisponibilidad(disponibilidad: string): {
  date: Date;
  minutes: number;
  desId: number;
} {
  const parts = disponibilidad.split(':');
  const dateTimeStr = parts[0];
  const minutes = parseInt(parts[1]);
  const desId = parseInt(parts[2]);

  const year = parseInt(dateTimeStr.substring(0, 4));
  const month = parseInt(dateTimeStr.substring(4, 6)) - 1;
  const day = parseInt(dateTimeStr.substring(6, 8));
  const hours = parseInt(dateTimeStr.substring(8, 10));
  const mins = parseInt(dateTimeStr.substring(10, 12));

  return {
    date: new Date(year, month, day, hours, mins),
    minutes,
    desId
  };
}

/**
 * Extrae el nombre y apellidos del nombre completo
 */
export function splitFullName(fullName: string): { nombre: string; apellidos: string } {
  const parts = fullName.trim().split(' ');
  if (parts.length === 1) {
    return { nombre: parts[0], apellidos: '' };
  }
  return {
    nombre: parts[0],
    apellidos: parts.slice(1).join(' ')
  };
}
