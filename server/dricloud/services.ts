import { driCloudRequest, DRICLOUD_CONFIG } from './auth';

// Interfaces para DriCloud
export interface DriCloudClinica {
  CLI_ID: number;
  CLI_NOMBRE: string;
  CLI_DIRECCION: string;
  CLI_TELEFONO: string;
  CLI_MAIL: string;
}

export interface DriCloudEspecialidad {
  ESP_ID: number;
  ESP_NOMBRE: string;
  ListadoTIPO_CITA: DriCloudTipoCita[];
}

export interface DriCloudTipoCita {
  TCI_ID: number;
  TCI_NOMBRE: string;
  TCI_MINUTOS_CITA: number;
  ImportePrivado: number;
}

export interface DriCloudDoctor {
  USU_ID: number;
  USU_NOMBRE: string;
  USU_APELLIDOS: string;
  USU_EMAIL: string;
  FotoPerfil?: string;
  ListadoESPECIALIDAD: { ESP_ID: number }[];
  Idioma?: string;
  USU_DOC_COLEGIADO?: string;
  CITA_ONLINE_MAS_INFO?: string;
}

export interface DriCloudPaciente {
  PAC_ID: number;
  PAC_NOMBRE: string;
  PAC_APELLIDOS: string;
  PAC_FECHA_NACIMIENTO: string;
  PAC_TELEFONO1: string;
  PAC_SEXO_ID: number;
  PAC_NIF?: string;
  PAC_EMAIL: string;
  PAC_SOC_ID?: number;
  PAC_IDIOMA?: string;
  PAC_NACIONALIDAD?: string;
  PAC_DIRECCION?: string;
  PAC_POBLACION?: string;
  PAC_COD_POSTAL?: string;
  PAC_PAIS?: string;
}

export interface DriCloudDisponibilidad {
  Disponibilidad: string[]; // Formato: "yyyyMMddHHmm:<MinCita>:<DES_ID>"
}

export interface DriCloudCitaResponse {
  CPA_ID: number;
}

/**
 * Obtiene las clínicas de DriCloud
 */
export async function getClinicas(): Promise<DriCloudClinica[]> {
  return driCloudRequest<DriCloudClinica[]>('GetClinicas');
}

/**
 * Obtiene las especialidades de DriCloud
 */
export async function getEspecialidades(cliId?: number): Promise<DriCloudEspecialidad[]> {
  return driCloudRequest<DriCloudEspecialidad[]>('GetEspecialidades', 'POST', {
    CLI_ID: cliId || DRICLOUD_CONFIG.clinicaId
  });
}

/**
 * Obtiene los doctores de DriCloud
 */
export async function getDoctores(espId?: number): Promise<DriCloudDoctor[]> {
  return driCloudRequest<DriCloudDoctor[]>('GetDoctores', 'POST', {
    ESP_ID: espId
  });
}

/**
 * Obtiene la disponibilidad de agenda de un doctor
 */
export async function getAgendaDisponibilidad(
  usuId: number,
  fecha: string, // formato yyyyMMdd
  desId?: number,
  cliId?: number,
  espId?: number,
  tciId?: number,
  diasRecuperar: number = 7
): Promise<DriCloudDisponibilidad> {
  return driCloudRequest<DriCloudDisponibilidad>('GetAgendaDisponibilidad', 'POST', {
    USU_ID: usuId,
    fecha: fecha,
    DES_ID: desId,
    CLI_ID: cliId || DRICLOUD_CONFIG.clinicaId,
    ESP_ID: espId,
    TCI_ID: tciId,
    diasRecuperar: diasRecuperar
  });
}

/**
 * Busca un paciente por teléfono
 */
export async function getPacientesPorTelefono(telefono: string): Promise<{ Pacientes: DriCloudPaciente[] }> {
  return driCloudRequest('GetPacientesPorTelefono', 'POST', { telefono });
}

/**
 * Busca un paciente por nombre, apellidos y teléfono
 */
export async function getPacientePorNombreTelefono(
  nombre: string,
  apellidos: string,
  telefono: string
): Promise<{ Exists: boolean; Paciente: DriCloudPaciente }> {
  return driCloudRequest('GetPacientePorNombreTelefono', 'POST', {
    nombre,
    apellidos,
    telefono
  });
}

/**
 * Crea un nuevo paciente en DriCloud
 */
export async function createPaciente(paciente: Partial<DriCloudPaciente>): Promise<{ PAC_ID: number }> {
  return driCloudRequest('PostCreatePaciente', 'POST', { paciente });
}

/**
 * Crea una cita en DriCloud
 */
export async function createCita(
  usuId: number,
  fechaInicioCitaString: string, // formato yyyyMMddHHmm
  pacId: number,
  tciId?: number,
  desId?: number,
  cliId?: number,
  observaciones?: string
): Promise<DriCloudCitaResponse> {
  return driCloudRequest('PostCitaPaciente', 'POST', {
    USU_ID: usuId,
    fechaInicioCitaString: fechaInicioCitaString,
    PAC_ID: pacId,
    TCI_ID: tciId,
    DES_ID: desId,
    CLI_ID: cliId || DRICLOUD_CONFIG.clinicaId,
    observaciones: observaciones
  });
}

/**
 * Cancela una cita en DriCloud
 */
export async function cancelCita(cpaId: number): Promise<{ success: boolean }> {
  return driCloudRequest('PostDeleteCitaPaciente', 'POST', {
    CPA_ID: cpaId
  });
}

/**
 * Modifica una cita en DriCloud
 */
export async function updateCita(
  cpaId: number,
  fechaInicioCitaString: string,
  minutos?: number
): Promise<{ success: boolean }> {
  return driCloudRequest('PostUpdateCitaPaciente', 'POST', {
    CPA_ID: cpaId,
    fechaInicioCitaString: fechaInicioCitaString,
    minutos: minutos
  });
}
