import { driCloudRequest, DRICLOUD_CONFIG, DriCloudSubscriptionError } from './auth';

// ─── Tipos según documentación DriCloud API v2 ────────────────────────────────

export interface DriCloudClinica {
  CLI_ID: number;
  CLI_NOMBRE: string;
  CLI_DIRECCION: string;
  CLI_TELEFONO: string;
  CLI_MAIL: string;
}

export interface DriCloudDespacho {
  DES_ID: number;
  DES_NOMBRE: string;
  CLI_ID: number;
}

export interface DriCloudSociedad {
  SOC_ID: number;
  SOC_NOMBRE: string;
}

export interface DriCloudTipoCita {
  TCI_ID: number;
  TCI_NOMBRE: string;
  TCI_MINUTOS_CITA: number;
  ImportePrivado?: number;
}

export interface DriCloudEspecialidad {
  ESP_ID: number;
  ESP_NOMBRE: string;
  ListadoTIPO_CITA: DriCloudTipoCita[];
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
  PAC_SEXO_ID: number; // 0=Sin determinar, 1=Femenino, 2=Masculino
  PAC_NIF?: string;
  PAC_EMAIL?: string;
  PAC_PASAPORTE?: string;
  PAC_SOC_ID?: number;
  PAC_TRAT_DATOS?: boolean;
  PAC_PROMOCIONES?: boolean;
  PAC_IDIOMA?: string;
  PAC_NACIONALIDAD?: string;
  PAC_DIRECCION?: string;
  PAC_POBLACION?: string;
  PAC_COD_POSTAL?: string;
  PAC_PAIS?: string;
  PAC_FAC_TUTOR_APELLIDOS?: string;
  PAC_FAC_TUTOR_NOMBRE?: string;
  PAC_FAC_TUTOR_NIF?: string;
  TCC_ID?: number;
}

export interface DriCloudDisponibilidad {
  Disponibilidad: string[]; // "yyyyMMddHHmm:<MinCita>:<DES_ID>"
}

export interface DriCloudCita {
  CPA_ID: number;
  CPA_FECHA_INICIO: string; // yyyyMMddHHmm
  CPA_FECHA_FIN: string;
  PAC_ID?: number;
  PAC_NHC?: string;
  USU_ID: number;
  USU_NOMBRE_COMPLETO?: string;
  CLI_ID?: number;
  CLI_NOMBRE?: string;
  PAC_NOMBRE?: string;
  PAC_APELLIDOS?: string;
  PAC_TELEFONO1?: string;
}

// ─── Clínicas ─────────────────────────────────────────────────────────────────
export async function getClinicas(): Promise<DriCloudClinica[]> {
  return driCloudRequest<DriCloudClinica[]>('GetClinicas');
}

// ─── Despachos ────────────────────────────────────────────────────────────────
export async function getDespachos(cliId?: number): Promise<DriCloudDespacho[]> {
  return driCloudRequest<DriCloudDespacho[]>('GetDespachos', {
    CLI_ID: cliId ?? DRICLOUD_CONFIG.clinicaId,
  });
}

// ─── Sociedades ───────────────────────────────────────────────────────────────
export async function getSociedades(): Promise<DriCloudSociedad[]> {
  return driCloudRequest<DriCloudSociedad[]>('GetSociedades');
}

// ─── Especialidades ───────────────────────────────────────────────────────────
export async function getEspecialidades(cliId?: number): Promise<DriCloudEspecialidad[]> {
  // Intento 1: con CLI_ID
  const body: Record<string, unknown> = {};
  if (cliId !== undefined) body.CLI_ID = cliId;

  const data = await driCloudRequest<{ Especialidades?: DriCloudEspecialidad[] } | DriCloudEspecialidad[]>('GetEspecialidades', body);
  if (Array.isArray(data)) return data;
  const list = (data as any).Especialidades;
  if (Array.isArray(list)) return list;

  // Intento 2: sin filtro (algunos setups de DriCloud no usan CLI_ID en especialidades)
  const data2 = await driCloudRequest<{ Especialidades?: DriCloudEspecialidad[] } | DriCloudEspecialidad[]>('GetEspecialidades', {});
  if (Array.isArray(data2)) return data2;
  return (data2 as any).Especialidades ?? [];
}

// ─── Doctores ─────────────────────────────────────────────────────────────────
export async function getDoctores(espId?: number): Promise<DriCloudDoctor[]> {
  const body: Record<string, unknown> = {};
  if (espId !== undefined) body.ESP_ID = espId;
  // DriCloud devuelve { Doctores: [...] } en Data
  const data = await driCloudRequest<{ Doctores?: DriCloudDoctor[] } | DriCloudDoctor[]>('GetDoctores', body);
  if (Array.isArray(data)) return data;
  return (data as any).Doctores ?? [];
}

// ─── Disponibilidad de agenda ─────────────────────────────────────────────────
export async function getAgendaDisponibilidad(params: {
  usuId?: number;
  listUsuIds?: number[];
  fecha: string;           // yyyyMMdd
  desId?: number;
  cliId?: number;
  espId?: number;
  tciId?: number;
  diasRecuperar?: number;  // 1–31, default 7
  socId?: number;
}): Promise<DriCloudDisponibilidad> {
  const body: Record<string, unknown> = {
    fecha: params.fecha,
    diasRecuperar: params.diasRecuperar ?? 7,
    CLI_ID: params.cliId ?? DRICLOUD_CONFIG.clinicaId,
  };
  if (params.usuId !== undefined) body.USU_ID = params.usuId;
  if (params.listUsuIds) body.List_USU_ID = params.listUsuIds;
  if (params.desId !== undefined) body.DES_ID = params.desId;
  if (params.espId !== undefined) body.ESP_ID = params.espId;
  if (params.tciId !== undefined) body.TCI_ID = params.tciId;
  if (params.socId !== undefined) body.SOC_ID = params.socId;
  return driCloudRequest<DriCloudDisponibilidad>('GetAgendaDisponibilidad', body);
}

// ─── Pacientes ────────────────────────────────────────────────────────────────
export async function getPacienteByNIF(
  nif: string
): Promise<{ Exists: boolean; Paciente: DriCloudPaciente }> {
  return driCloudRequest('GetPacienteByNIF', { id: nif });
}

export async function getPacientesPorTelefono(
  telefono: string
): Promise<{ Pacientes: DriCloudPaciente[] }> {
  return driCloudRequest('GetPacientesPorTelefono', { telefono });
}

export async function getPacientePorNombreTelefono(
  nombre: string,
  apellidos: string,
  telefono: string
): Promise<{ Exists: boolean; Paciente: DriCloudPaciente }> {
  try {
    return await driCloudRequest('GetPacientePorNombreTelefono', { nombre, apellidos, telefono });
  } catch (err) {
    // DriCloud devuelve Successful:false con "Paciente no existente o varias coincidencias" cuando
    // no hay coincidencia. Para el flujo verificar-o-crear, "no existe" debe interpretarse como
    // Exists:false (→ crear paciente), NO como un error 500 que rompe todo el flujo.
    if (err instanceof DriCloudSubscriptionError && /no existente|no encontrad|no found/i.test(err.message)) {
      return { Exists: false, Paciente: {} as DriCloudPaciente };
    }
    throw err;
  }
}

export async function createPaciente(
  paciente: Omit<DriCloudPaciente, 'PAC_ID'>
): Promise<{ PAC_ID: number }> {
  // Body plano (igual que el resto de endpoints de DriCloud). Envolver en {paciente}
  // hace que DriCloud no encuentre PAC_NOMBRE y devuelva "Nombre es obligatorio".
  return driCloudRequest('PostCreatePaciente', paciente);
}

// ─── Citas ────────────────────────────────────────────────────────────────────
export async function createCita(params: {
  usuId: number;
  fechaInicioCitaString: string; // yyyyMMddHHmm
  pacId: number;
  tciId?: number;
  desId?: number;
  cliId?: number;
  observaciones?: string;
}): Promise<{ CPA_ID: number }> {
  const body: Record<string, unknown> = {
    USU_ID: params.usuId,
    fechaInicioCitaString: params.fechaInicioCitaString,
    PAC_ID: params.pacId,
    CLI_ID: params.cliId ?? DRICLOUD_CONFIG.clinicaId,
  };
  if (params.tciId !== undefined) body.TCI_ID = params.tciId;
  if (params.desId !== undefined) body.DES_ID = params.desId;
  if (params.observaciones) body.observaciones = params.observaciones;
  return driCloudRequest('PostCitaPaciente', body);
}

/**
 * Fetch a single appointment by its CPA_ID.
 * Used by ownership guards before any mutation.
 * Returns null when the appointment is not found.
 */
export async function getCitaById(cpaId: number): Promise<DriCloudCita | null> {
  const result = await driCloudRequest<DriCloudCita | null>('GetCitaPorId', { CPA_ID: cpaId });
  return result ?? null;
}

export async function updateCita(params: {
  cpaId: number;
  fechaInicioCitaString: string; // yyyyMMddHHmm
  minutos?: number;
}): Promise<{ CPA_ID: number }> {
  const body: Record<string, unknown> = {
    CPA_ID: params.cpaId,
    fechaInicioCitaString: params.fechaInicioCitaString,
  };
  if (params.minutos !== undefined) body.minutos = params.minutos;
  return driCloudRequest('PostUpdateCitaPaciente', body);
}

export async function deleteCita(cpaId: number): Promise<{ CPA_ID: number }> {
  return driCloudRequest('PostDeleteCitaPaciente', { CPA_ID: cpaId });
}

export async function getCitasByNIF(params: {
  nif: string;
  fechaInicioString?: string; // yyyyMMdd
  fechaFinString?: string;    // yyyyMMdd
  usuId?: number;
}): Promise<DriCloudCita[]> {
  const body: Record<string, unknown> = { id: params.nif };
  if (params.fechaInicioString) body.fechaInicioString = params.fechaInicioString;
  if (params.fechaFinString) body.fechaFinString = params.fechaFinString;
  if (params.usuId !== undefined) body.USU_ID = params.usuId;
  return driCloudRequest<DriCloudCita[]>('GetPacienteCitasByNIF', body);
}

export async function getCitasPacientes(params: {
  fecha: string; // yyyyMMdd
  usuId?: number;
  pacId?: number;
  diasRecuperar?: number;
}): Promise<DriCloudCita[]> {
  const body: Record<string, unknown> = {
    fecha: params.fecha,
    diasRecuperar: params.diasRecuperar ?? 1,
    buscarPorFechaModificacion: false,
  };
  if (params.usuId !== undefined) body.USU_ID = params.usuId;
  if (params.pacId !== undefined) body.PAC_ID = params.pacId;
  return driCloudRequest<DriCloudCita[]>('GetCitasPacientes', body);
}
