import { createHmac, timingSafeEqual } from 'crypto';

export interface SlotPayload {
  u: number;
  f: string;
  h: string;
  t: number;
  d: number | null;
  m: number;
  esp: number | null;
}

export class InvalidSlotError extends Error {
  constructor(reason: string) {
    super(`Invalid slot token: ${reason}`);
    this.name = 'InvalidSlotError';
  }
}

function getSecret(): string {
  const s = process.env.GHL_MIDDLEWARE_SECRET;
  if (!s) throw new Error('GHL_MIDDLEWARE_SECRET environment variable is not set');
  return s;
}

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function encodeSlot(payload: SlotPayload): string {
  const secret = getSecret();
  const payloadB64 = b64url(JSON.stringify(payload));
  const sig = hmac(secret, payloadB64);
  return `${payloadB64}.${sig}`;
}

export function decodeSlot(token: string): SlotPayload {
  const secret = getSecret();
  const dotIndex = token.indexOf('.');
  if (dotIndex <= 0 || dotIndex === token.length - 1) {
    throw new InvalidSlotError('malformed token — no valid "." separator');
  }
  const payloadB64 = token.slice(0, dotIndex);
  const receivedSig = token.slice(dotIndex + 1);

  const expectedSig = hmac(secret, payloadB64);

  // Constant-time comparison to prevent timing attacks.
  const expectedBuf = Buffer.from(expectedSig);
  const receivedBuf = Buffer.from(receivedSig);
  const same =
    expectedBuf.length === receivedBuf.length &&
    timingSafeEqual(expectedBuf, receivedBuf);

  if (!same) throw new InvalidSlotError('signature mismatch');

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    throw new InvalidSlotError('payload is not valid JSON');
  }

  if (
    raw === null ||
    typeof raw !== 'object' ||
    typeof (raw as Record<string, unknown>).u !== 'number' ||
    typeof (raw as Record<string, unknown>).f !== 'string' ||
    typeof (raw as Record<string, unknown>).h !== 'string' ||
    typeof (raw as Record<string, unknown>).t !== 'number' ||
    !(
      typeof (raw as Record<string, unknown>).d === 'number' ||
      (raw as Record<string, unknown>).d === null
    ) ||
    typeof (raw as Record<string, unknown>).m !== 'number' ||
    !(
      typeof (raw as Record<string, unknown>).esp === 'number' ||
      (raw as Record<string, unknown>).esp === null
    )
  ) {
    throw new InvalidSlotError('payload shape invalid');
  }

  return raw as SlotPayload;
}
