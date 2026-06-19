import type { Express, Request, Response, NextFunction } from 'express';
import * as crm from '../services/crmService';
import * as otpService from '../services/otpService';

// ─── Tipado de la sesión ──────────────────────────────────────────────────────
// Module augmentation: añade el usuario autenticado a la sesión de express-session.
declare module 'express-session' {
  interface SessionData {
    user?: { phone: string; contactId: string };
  }
}

// ─── Middleware de protección de rutas ────────────────────────────────────────
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.user) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  next();
}

// ─── Normalización básica del teléfono ────────────────────────────────────────
// Mantiene el dígito inicial y el prefijo '+', elimina espacios/guiones para
// que la clave del OTP y la búsqueda en el CRM sean consistentes.
function normalizePhone(raw: unknown): string {
  return String(raw ?? '').trim().replace(/[\s\-().]/g, '');
}

// ─── Rate limiting en memoria ──────────────────────────────────────────────────
// request-otp: frena el spam de envíos y la creación masiva de contactos.
// verify-otp: frena el brute-force de códigos y el agotamiento del contador de
// una víctima (DoS de cuenta). Cada endpoint tiene su propio store y su límite.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const REQUEST_OTP_MAX = 3;
const VERIFY_OTP_MAX = 10;
const requestOtpRateStore = new Map<string, { count: number; resetAt: number }>();
const verifyOtpRateStore = new Map<string, { count: number; resetAt: number }>();

function allowRequest(
  store: Map<string, { count: number; resetAt: number }>,
  key: string,
  max: number,
): boolean {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= max) {
    return false;
  }
  entry.count += 1;
  return true;
}

export function registerAuthRoutes(app: Express): void {
  // ─── Solicitar OTP ──────────────────────────────────────────────────────────
  app.post('/api/auth/request-otp', async (req: Request, res: Response) => {
    const phone = normalizePhone(req.body?.phoneNumber);
    if (!phone) {
      return res.status(400).json({ error: 'phoneNumber requerido' });
    }

    const rateKey = `${phone}:${req.ip}`;
    if (!allowRequest(requestOtpRateStore, rateKey, REQUEST_OTP_MAX)) {
      return res.status(429).json({ error: 'Demasiadas solicitudes. Inténtalo de nuevo más tarde.' });
    }

    try {
      // Buscar el contacto; si no existe en el CRM, crearlo al vuelo.
      let contactId = await crm.findContactByPhone(phone);
      if (!contactId) {
        contactId = await crm.createContact(phone);
      }

      // Generar OTP y dispararlo por WhatsApp vía el campo custom del CRM.
      const otp = otpService.createOtp(phone, contactId);
      await crm.setOtpField(contactId, otp);

      // Nunca se devuelve el OTP al cliente.
      return res.json({ ok: true });
    } catch (error) {
      console.error('[Auth] Error en request-otp:', (error as Error).message);
      return res.status(502).json({ error: 'No se pudo enviar el código. Inténtalo más tarde.' });
    }
  });

  // ─── Verificar OTP ────────────────────────────────────────────────────────────
  app.post('/api/auth/verify-otp', async (req: Request, res: Response) => {
    const phone = normalizePhone(req.body?.phoneNumber);
    const otp = String(req.body?.otp ?? '').trim();

    if (!phone || !otp) {
      return res.status(400).json({ error: 'phoneNumber y otp requeridos' });
    }

    const rateKey = `${phone}:${req.ip}`;
    if (!allowRequest(verifyOtpRateStore, rateKey, VERIFY_OTP_MAX)) {
      return res.status(429).json({ error: 'Demasiados intentos. Inténtalo de nuevo más tarde.' });
    }

    const result = otpService.verify(phone, otp);

    if (!result.ok) {
      const messages: Record<string, string> = {
        not_found: 'No hay ningún código activo para este número. Solicita uno nuevo.',
        expired: 'El código ha caducado. Solicita uno nuevo.',
        too_many_attempts: 'Demasiados intentos fallidos. Solicita un código nuevo.',
        mismatch: 'Código incorrecto.',
      };
      return res.status(401).json({ error: messages[result.reason], attemptsLeft: result.attemptsLeft });
    }

    // Regenerar la sesión antes de asignar la identidad (anti session fixation):
    // descarta cualquier session id previo que un atacante hubiera podido fijar.
    const { contactId } = result;
    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error('[Auth] Error regenerando la sesión:', regenErr.message);
        return res.status(500).json({ error: 'No se pudo iniciar sesión. Inténtalo de nuevo.' });
      }

      req.session.user = { phone, contactId };

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('[Auth] Error guardando la sesión:', saveErr.message);
          return res.status(500).json({ error: 'No se pudo iniciar sesión. Inténtalo de nuevo.' });
        }

        // Limpiar el campo OTP en el CRM (best-effort, anti-replay).
        crm.clearOtpField(contactId).catch((err) =>
          console.error('[Auth] No se pudo limpiar el campo OTP:', (err as Error).message),
        );

        res.json({ ok: true });
      });
    });
  });

  // ─── Estado de sesión ─────────────────────────────────────────────────────────
  app.get('/api/auth/me', (req: Request, res: Response) => {
    if (req.session?.user) {
      return res.json({ authenticated: true, phone: req.session.user.phone });
    }
    return res.json({ authenticated: false });
  });

  // ─── Logout ─────────────────────────────────────────────────────────────────
  app.post('/api/auth/logout', (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });
}
