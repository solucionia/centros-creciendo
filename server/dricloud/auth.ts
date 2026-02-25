import crypto from 'crypto';

// ─── Error especial para suscripción inactiva ─────────────────────────────────
export class DriCloudSubscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriCloudSubscriptionError';
  }
  isSubscriptionError(): boolean {
    const msg = this.message.toLowerCase();
    return msg.includes('suscripci') ||
           msg.includes('subscription') ||
           msg.includes('clinic id not found') ||
           msg.includes('no found') ||
           msg.includes('token incorrecto');
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

// ─── Caché del token — con mutex para evitar logins paralelos ─────────────────
let tokenCache: { token: string; expiresAt: number } | null = null;
let loginInProgress: Promise<string> | null = null;

export function clearTokenCache(): void {
  tokenCache = null;
  loginInProgress = null;
  console.log('[DriCloud] Token cache limpiado');
}

/** URL base de la API de la clínica */
export function getClinicaApiUrl(): string {
  return `${DRICLOUD_CONFIG.baseUrl}/${DRICLOUD_CONFIG.urlClinica}/api/APIWeb`;
}

// ─── MD5 en MAYÚSCULAS (idéntico al script Postman oficial) ──────────────────
// Script Postman: CryptoJS.MD5(str).toString(CryptoJS.enc.Hex).toUpperCase()
function md5(input: string): string {
  return crypto.createHash('md5').update(input, 'utf8').digest('hex').toUpperCase();
}

function generateHash(userName: string, password: string, timeSpan: string, salt: string): string {
  const passwordMd5 = md5(password);
  const combined = userName + passwordMd5 + timeSpan + salt;
  return md5(combined);
}

// ─── Login con mutex: solo un login paralelo a la vez ────────────────────────
async function doLogin(): Promise<string> {
  // timeSpanString en hora de España (Europe/Madrid) — DriCloud valida contra su reloj
  const now = new Date();
  const parts = new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '00';
  const timeSpanString =
    get('year') +
    get('month') +
    get('day') +
    get('hour') +
    get('minute') +
    get('second');

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

export async function getDriCloudToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  // Si ya hay un login en curso, esperar el mismo en vez de lanzar otro
  if (!loginInProgress) {
    loginInProgress = doLogin().finally(() => {
      loginInProgress = null;
    });
  }

  return loginInProgress;
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
