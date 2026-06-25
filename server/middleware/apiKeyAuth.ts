import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { sendError } from './ghlError';

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) {
    // Run a dummy comparison so execution time does not leak length info.
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const expectedKey = process.env.GHL_MIDDLEWARE_API_KEY ?? '';
  const receivedKey = (req.headers['x-api-key'] as string) ?? '';

  if (!expectedKey || !safeEqual(receivedKey, expectedKey)) {
    sendError(res, 'API_KEY_INVALIDA', 'API key inválida o ausente.');
    return;
  }

  const expectedLocation = process.env.GHL_LOCATION_ID;
  if (expectedLocation) {
    const receivedLocation = (req.headers['x-crm-location'] as string) ?? '';
    if (!safeEqual(receivedLocation, expectedLocation)) {
      sendError(res, 'API_KEY_INVALIDA', 'X-CRM-Location no coincide con la ubicación configurada.');
      return;
    }
  }

  next();
}
