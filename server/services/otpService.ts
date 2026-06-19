import crypto from 'crypto';

// ─── Almacén de OTP en memoria del proceso ────────────────────────────────────
// Decisión de arquitectura: Map en memoria con TTL, sin Redis (coherente con
// MemStorage). El OTP se pierde al reiniciar el proceso, aceptable para un solo
// proceso. NUNCA se loguea el valor del OTP.

const OTP_EXPIRY_SECONDS = parseInt(process.env.OTP_EXPIRY_SECONDS || '300', 10);
const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '3', 10);

interface OtpEntry {
  otp: string;
  contactId: string;
  expiresAt: number;
  attempts: number;
}

const store = new Map<string, OtpEntry>();

export type VerifyResult =
  | { ok: true; contactId: string }
  | { ok: false; reason: 'not_found' | 'expired' | 'too_many_attempts' | 'mismatch'; attemptsLeft: number };

// ─── Generar un OTP numérico de 6 dígitos ─────────────────────────────────────
function generateOtp(): string {
  // randomInt es exclusivo en el límite superior → rango [100000, 999999].
  return crypto.randomInt(100000, 1000000).toString();
}

// ─── Crear y almacenar un OTP para un teléfono ────────────────────────────────
// Devuelve el código generado para que el llamador lo envíe al CRM.
export function createOtp(phone: string, contactId: string): string {
  const otp = generateOtp();
  store.set(phone, {
    otp,
    contactId,
    expiresAt: Date.now() + OTP_EXPIRY_SECONDS * 1000,
    attempts: 0,
  });
  return otp;
}

// ─── Validar un OTP ───────────────────────────────────────────────────────────
// Controla expiración e intentos. Borra la entrada al validar o al agotar
// los intentos para impedir reuso.
export function verify(phone: string, otp: string): VerifyResult {
  const entry = store.get(phone);

  if (!entry) {
    return { ok: false, reason: 'not_found', attemptsLeft: 0 };
  }

  if (Date.now() > entry.expiresAt) {
    store.delete(phone);
    return { ok: false, reason: 'expired', attemptsLeft: 0 };
  }

  if (entry.attempts >= OTP_MAX_ATTEMPTS) {
    store.delete(phone);
    return { ok: false, reason: 'too_many_attempts', attemptsLeft: 0 };
  }

  if (entry.otp !== otp) {
    entry.attempts += 1;
    const attemptsLeft = OTP_MAX_ATTEMPTS - entry.attempts;
    if (attemptsLeft <= 0) {
      store.delete(phone);
      return { ok: false, reason: 'too_many_attempts', attemptsLeft: 0 };
    }
    return { ok: false, reason: 'mismatch', attemptsLeft };
  }

  // Validación correcta: consumir el OTP.
  store.delete(phone);
  return { ok: true, contactId: entry.contactId };
}

// ─── Descartar un OTP pendiente (p. ej. al solicitar uno nuevo) ───────────────
export function clear(phone: string): void {
  store.delete(phone);
}
