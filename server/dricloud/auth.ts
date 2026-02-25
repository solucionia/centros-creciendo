import crypto from 'crypto';

// ─── Error especial para suscripción inactiva ─────────────────────────────────
// Definido primero para que esté disponible en todo el módulo
export class DriCloudSubscriptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriCloudSubscriptionError';
  }
  isSubscriptionError(): boolean {
    return this.message.toLowerCase().includes('suscripci');
  }
}

// ─── Configuración (leída desde variables de entorno/secretos) ────────────────
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

interface DriCloudResponse<T> {
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

// ─── Generación del hash MD5 (mismo algoritmo que el ejemplo C# oficial) ─────
function md5(input: string): string {
  return crypto.createHash('md5').update(input, 'utf8').digest('hex');
}

function generateHash(userName: string, password: string, timeSpan: string, salt: string): string {
  const passwordMd5 = md5(password);                         // MD5(password)
  const combined = userName + passwordMd5 + timeSpan + salt; // concatenar
  return md5(combined);                                       // MD5 final
}

// ─── Login ────────────────────────────────────────────────────────────────────
export async function getDriCloudToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  // timeSpanString en hora de España peninsular (UTC+1/UTC+2 según DST)
  const now = new Date();
  const timeSpanString = now
    .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }) // "2025-10-13 07:04:52"
    .replace(/[-: ]/g, '')                                   // "20251013070452"
    .substring(0, 14);

  const hash = generateHash(
    DRICLOUD_CONFIG.userName,
    DRICLOUD_CONFIG.apiPassword,
    timeSpanString,
    DRICLOUD_CONFIG.salt
  );

  const loginUrl = `${DRICLOUD_CONFIG.baseUrl}/${DRICLOUD_CONFIG.urlClinica}/api/APIWeb/LoginExternalHash`;

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
    throw new Error(`[DriCloud] Login HTTP error: ${response.status} ${response.statusText}`);
  }

  // Estructura real de la respuesta: { Successful, Data: { USU_APITOKEN, URL, ... } }
  const body: DriCloudResponse<DriCloudLoginData> = await response.json();

  if (!body.Successful || !body.Data?.USU_APITOKEN) {
    const msg = body.Html || body.ErrorMessage || 'Error desconocido en login';
    // Lanzar como DriCloudSubscriptionError para que el fallback demo funcione
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
  const url = `${DRICLOUD_CONFIG.baseUrl}/${DRICLOUD_CONFIG.urlClinica}/api/APIWeb/${endpoint}`;

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
    throw new Error(`[DriCloud] HTTP ${response.status} en ${endpoint}`);
  }

  const data: DriCloudResponse<T> = await response.json();

  if (data.Successful === false) {
    const msg = data.Html || data.ErrorMessage || 'Error de DriCloud';
    console.warn(`[DriCloud] ⚠️  ${endpoint}: ${msg}`);
    throw new DriCloudSubscriptionError(msg);
  }

  return data.Data;
}
