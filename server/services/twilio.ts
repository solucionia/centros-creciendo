/**
 * Servicio de envío de OTP por SMS vía Twilio (Programmable Messaging).
 *
 * Se usa el propio código generado por otpService (del proceso) y se envía por
 * la API de Mensajes de Twilio. Así el código que recibe el usuario es el mismo
 * que valida la app — sin depender de plantillas de Meta ni de workflows de GHL.
 *
 * Variables de entorno requeridas:
 *   TWILIO_ACCOUNT_SID  (AC...)
 *   TWILIO_AUTH_TOKEN   (***)
 *   TWILIO_SENDER       (número de Twilio con SMS, E.164)
 */

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const SENDER = process.env.TWILIO_SENDER || '';

/** Compone el mensaje (el código lo genera la app, no Twilio Verify). */
export function buildOtpMessage(code: string): string {
  return `Tu código de acceso a CitaFácil es ${code}. Expira en 5 minutos. No lo compartas con nadie.`;
}

/**
 * Envía el código OTP por SMS al teléfono indicado (E.164).
 * Lanza si Twilio no está configurado o si la API devuelve error.
 */
export async function sendOtpSms(toPhone: string, code: string): Promise<void> {
  if (!ACCOUNT_SID || !AUTH_TOKEN || !SENDER) {
    throw new Error('Twilio no configurado (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_SENDER)');
  }

  const body = new URLSearchParams({
    From: SENDER,
    To: toPhone,
    Body: buildOtpMessage(code),
  });

  const url = `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`;
  const auth = 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': auth,
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Twilio SMS error ${res.status}: ${text}`);
  }
}
