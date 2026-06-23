// ─── Cliente del CRM GoHighLevel (LeadConnector) para el login con OTP ────────
// Sigue el mismo patrón de llamadas HTTP que server/dricloud/auth.ts:
// fetch nativo + headers propios + manejo de errores explícito.
// Spec de referencia: whatsapp-otp-integration.md

const CRM_CONFIG = {
  baseUrl: process.env.CRM_BASE_URL || 'https://services.leadconnectorhq.com',
  apiKey: process.env.CRM_API_KEY || '',
  locationId: process.env.CRM_LOCATION_ID || '',
  version: '2021-07-28',
};

// Campo personalizado cuyo cambio dispara el Workflow de WhatsApp en el CRM.
const OTP_FIELD_ID = 'mI279Pa1MUefkbCNAA7X';

function crmHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${CRM_CONFIG.apiKey}`,
    Version: CRM_CONFIG.version,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

// ─── Tipos parciales de las respuestas del CRM ───────────────────────────────
interface CrmContact {
  id: string;
}

interface ContactDuplicateSearchResponse {
  contact?: CrmContact | null;
}

interface ContactUpsertResponse {
  contact?: CrmContact;
}

// ─── Buscar contacto por teléfono ─────────────────────────────────────────────
// Uses the duplicate-search endpoint which matches by exact phone number.
// Returns the contactId if found, or null if no match exists.
// The old /contacts/search route was incorrect — GHL routes it as GET /contacts/{id}
// with id="search", returning HTTP 400.
export async function findContactByPhone(phone: string): Promise<string | null> {
  const url =
    `${CRM_CONFIG.baseUrl}/contacts/search/duplicate` +
    `?locationId=${encodeURIComponent(CRM_CONFIG.locationId)}` +
    `&number=${encodeURIComponent(phone)}`;

  const response = await fetch(url, { method: 'GET', headers: crmHeaders() });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[CRM] Error HTTP en findContactByPhone: ${response.status} ${text}`);
    throw new Error(`CRM search failed: HTTP ${response.status}`);
  }

  const data: ContactDuplicateSearchResponse = await response.json();
  return data.contact?.id ?? null;
}

// ─── Crear contacto al vuelo ──────────────────────────────────────────────────
// Se usa cuando el teléfono aún no existe en el CRM (paciente nuevo).
export async function createContact(phone: string): Promise<string> {
  const url = `${CRM_CONFIG.baseUrl}/contacts/`;

  const response = await fetch(url, {
    method: 'POST',
    headers: crmHeaders(),
    body: JSON.stringify({
      locationId: CRM_CONFIG.locationId,
      phone,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`[CRM] Error HTTP en createContact: ${response.status} ${text}`);
    throw new Error(`CRM create failed: HTTP ${response.status}`);
  }

  const data: ContactUpsertResponse = await response.json();
  const contactId = data.contact?.id;
  if (!contactId) {
    throw new Error('CRM create: respuesta sin contactId');
  }
  return contactId;
}

// ─── Escribir el OTP en el campo custom → dispara el Workflow de WhatsApp ─────
export async function setOtpField(contactId: string, otp: string): Promise<void> {
  await updateOtpField(contactId, otp);
}

// ─── Limpiar el campo OTP tras una validación correcta (anti-replay) ──────────
export async function clearOtpField(contactId: string): Promise<void> {
  await updateOtpField(contactId, '');
}

async function updateOtpField(contactId: string, value: string): Promise<void> {
  const url = `${CRM_CONFIG.baseUrl}/contacts/${encodeURIComponent(contactId)}`;

  const response = await fetch(url, {
    method: 'PUT',
    headers: crmHeaders(),
    body: JSON.stringify({
      customFields: [{ id: OTP_FIELD_ID, field_value: value }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    // No se loguea nunca el valor del OTP, solo el contactId.
    console.error(`[CRM] Error HTTP actualizando campo OTP de ${contactId}: ${response.status} ${text}`);
    throw new Error(`CRM update field failed: HTTP ${response.status}`);
  }
}
