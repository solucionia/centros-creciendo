import crypto from 'crypto';

interface LoginResponse {
  URL: string;
  USU_ID: number;
  USU_GUID: string;
  USU_APITOKEN: string;
}

// Configuración de DriCloud
const DRICLOUD_CONFIG = {
  baseUrl: 'https://apidricloud.dricloud.net',
  urlClinica: process.env.DRICLOUD_URL_CLINICA || '',
  clinicaId: parseInt(process.env.DRICLOUD_CLINICA_ID || '0'),
  apiPassword: process.env.DRICLOUD_API_PASSWORD || '',
  userName: 'WebAPI',
  salt: 'sFfDS395$YGTry546g'
};

// Cache del token con expiración
let tokenCache: { token: string; expiresAt: number } | null = null;

/**
 * Genera el hash MD5 requerido por DriCloud para autenticación
 */
function generateHash(userName: string, password: string, timeSpan: string, salt: string): string {
  // Hash MD5 de la contraseña
  const passwordHash = crypto.createHash('md5').update(password).digest('hex');
  
  // Hash MD5 de userName + passwordHash + timeSpan + salt
  const combinedString = userName + passwordHash + timeSpan + salt;
  const finalHash = crypto.createHash('md5').update(combinedString).digest('hex');
  
  return finalHash;
}

/**
 * Realiza login en DriCloud y obtiene el token de API
 */
export async function getDriCloudToken(): Promise<string> {
  // Verificar si tenemos un token válido en cache
  if (tokenCache && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }

  // Generar timeSpan (formato: yyyyMMddHHmmss)
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const timeSpanString = `${year}${month}${day}${hours}${minutes}${seconds}`;

  // Generar hash
  const hash = generateHash(
    DRICLOUD_CONFIG.userName,
    DRICLOUD_CONFIG.apiPassword,
    timeSpanString,
    DRICLOUD_CONFIG.salt
  );

  // Realizar login
  const loginUrl = `${DRICLOUD_CONFIG.baseUrl}/${DRICLOUD_CONFIG.urlClinica}/api/APIWeb/LoginExternalHash`;
  
  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      userName: DRICLOUD_CONFIG.userName,
      timeSpanString: timeSpanString,
      hash: hash,
      idClinica: DRICLOUD_CONFIG.clinicaId
    })
  });

  if (!response.ok) {
    throw new Error(`DriCloud login failed: ${response.status} ${response.statusText}`);
  }

  const data: LoginResponse = await response.json();
  
  // Guardar token en cache (expira en 23 horas para estar seguros)
  tokenCache = {
    token: data.USU_APITOKEN,
    expiresAt: Date.now() + (23 * 60 * 60 * 1000)
  };

  console.log('[DriCloud] Login successful, token cached');
  
  return data.USU_APITOKEN;
}

/**
 * Realiza una petición autenticada a DriCloud
 */
export async function driCloudRequest<T>(
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  body?: any
): Promise<T> {
  const token = await getDriCloudToken();
  const url = `${DRICLOUD_CONFIG.baseUrl}/${DRICLOUD_CONFIG.urlClinica}/api/APIWeb/${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'USU_APITOKEN': token
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[DriCloud] Request failed: ${endpoint}`, errorText);
    throw new Error(`DriCloud request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export { DRICLOUD_CONFIG };
