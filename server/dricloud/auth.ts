import crypto from 'crypto';

// ─── Error especial para suscripción inactiva ─────────────────────────────────
export class DriCloudSubscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriCloudSubscriptionError';
  }
  isSubscriptionError(): boolean {
    return this.message.toLowerCase().includes('suscripci') ||
           this.message.toLowerCase().includes('subscription') ||
           this.message.toLowerCase().includes('clinic id not found') ||
           this.message.toLowerCase().includes('no found');
  }
}

// ─── Configuración desde secretos de entorno ──────────────────────────────────
// DRICLOUD_URL_CLINICA  → segmento de URL completo, ej: "Dricloud_creciendomirasierra_20627620"
// DRICLOUD_CLINICA_ID  → idClinica para el body del login, ej: "20627"
// DRICLOUD_API_PASSWORD → contraseña del usuario WebAPI
export const DRICLOUD_CONFIG = {
  baseUrl: 'https://apidricloud.dricloud.net',
  urlClinica: process.env.DRICLOUD_URL_CLINICA || '',
  clinicaId: parseInt(process.env.DRICLOUD_CLINICA_ID || '0'),
  apiPassword: process.env.DRICLOUD_API_PASSWORD || '',
  userName: 'WebAPI',
  salt: 'sFfDS395$YGTry546g',
};

// ─── Tipos de respuesta de DriCloud ──────────────────────────────────────────
interface DriCloudLoginData {
  URL: string;
  USU_ID: number;
  USU_GUID: string;
  USU_APITOKEN: string;
}

export interface DriCloudResponse<T> {
  Successful: boolean;
  Html: string | null;
  Data: T;
  ErrorMessage: string | null;
}

// ─── Caché del token ──────────────────────────────────────────────────────────
let tokenCache: { token: string; expiresAt: number } | null = null;

export function clearTokenCache(): void {
  tokenCache = null;
  console.log('[DriCloud] Token cache limpiado');
}

/** URL base de la API de la clínica */
export function getClinicaApiUrl(): string {
  return `${DRICLOUD_CONFIG.baseUrl}/${DRICLOUD_CONFIG.urlClinica}/api/APIWeb`;
}

// ─── Generación del hash MD5 en MAYÚSCULAS (idéntico al script Postman oficial) ─
// Script Postman: CryptoJS.MD5(str).toString(CryptoJS.enc.Hex).toUpperCase()
function md5(input: string): string {
  return crypto.createHash('md5').update(input, 'utf8').digest('hex').toUpperCase();
}

function generateHash(userName: string, password: string, timeSpan: string, salt: string): string {
  const passwordMd5 = md5(password);
  const combined = userName + passwordMd5 + timeSpan + salt;
  return md5(combined);
}

// ─── Login ────────────────────────────────────────────────────────────────────
export async function getDriCloudToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  // timeSpanString: exactamente como en el script Postman oficial
  // const date = new Date(); pad(date.getHours()); ... (sin conversión de zona horaria)
  const now = new Date();
  const pad = (n: number) => n < 10 ? '0' + n : String(n);
  const timeSpanString =
    now.getFullYear().toString() +
    pad(now.getMonth() + 1) +
    pad(now.getDate()) +
    pad(now.getHours()) +
    pad(now.getMinutes()) +
    pad(now.getSeconds());

  const hash = generateHash(
    DRICLOUD_CONFIG.userName,
    DRICLOUD_CONFIG.apiPassword,
    timeSpanString,
    DRICLOUD_CONFIG.salt
  );

  const loginUrl = `${getClinicaApiUrl()}/LoginExternalHash`;

  console.log(`[DriCloud] Login → ${loginUrl}`);
  console.log(`[DriCloud] timeSpan=${timeSpanString}, idClinica=${DRICLOUD_CONFIG.clinicaId}`);

  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userName: DRICLOUD_CONFIG.userName,
      timeSpanString,
      hash,
      idClinica: DRICLOUD_CONFIG.clinicaId,
    }),
  });

  if (!response.ok) {
    throw new DriCloudSubscriptionError(`Login HTTP error: ${response.status} ${response.statusText}`);
  }

  // Estructura real: { Successful, Data: { USU_APITOKEN, URL, ... } }
  const body: DriCloudResponse<DriCloudLoginData> = await response.json();
  console.log('[DriCloud] Respuesta login:', JSON.stringify(body).substring(0, 200));

  if (!body.Successful || !body.Data?.USU_APITOKEN) {
    const msg = body.Html || body.ErrorMessage || 'Error desconocido en login';
    throw new DriCloudSubscriptionError(`Login: ${msg}`);
  }

  const token = body.Data.USU_APITOKEN;
  tokenCache = { token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
  console.log('[DriCloud] ✅ Login exitoso, token cacheado');
  return token;
}

// ─── Petición autenticada a DriCloud ─────────────────────────────────────────
export async function driCloudRequest<T>(
  endpoint: string,
  body?: Record<string, unknown>
): Promise<T> {
  const token = await getDriCloudToken();
  const url = `${getClinicaApiUrl()}/${endpoint}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'USU_APITOKEN': token,
    },
    body: JSON.stringify(body ?? {}),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[DriCloud] Error HTTP en ${endpoint}:`, text);
    throw new DriCloudSubscriptionError(`HTTP ${response.status} en ${endpoint}`);
  }

  const data: DriCloudResponse<T> = await response.json();

  if (data.Successful === false) {
    const msg = data.Html || data.ErrorMessage || 'Error de DriCloud';
    console.warn(`[DriCloud] ⚠️  ${endpoint}: ${msg}`);
    throw new DriCloudSubscriptionError(msg);
  }

  return data.Data;
}
