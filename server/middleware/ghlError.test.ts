import { describe, it, expect } from 'vitest';
import type { Response } from 'express';
import { sendError } from './ghlError';

function mockRes() {
  let statusCode = 200;
  let body: unknown;
  const res = {
    status(code: number) { statusCode = code; return res; },
    json(data: unknown) { body = data; return res; },
    getStatus: () => statusCode,
    getBody: () => body,
  } as unknown as Response & { getStatus(): number; getBody(): unknown };
  return res;
}

describe('sendError', () => {
  it('DATOS_INCOMPLETOS → 400 with correct envelope', () => {
    const res = mockRes();
    sendError(res, 'DATOS_INCOMPLETOS', 'Falta telefono');
    expect(res.getStatus()).toBe(400);
    expect(res.getBody()).toEqual({
      success: false,
      codigo_error: 'DATOS_INCOMPLETOS',
      mensaje: 'Falta telefono',
    });
  });

  it('API_KEY_INVALIDA → 401', () => {
    const res = mockRes();
    sendError(res, 'API_KEY_INVALIDA', 'Clave incorrecta');
    expect(res.getStatus()).toBe(401);
    expect((res.getBody() as any).codigo_error).toBe('API_KEY_INVALIDA');
  });

  it('PACIENTE_NO_ENCONTRADO → 404', () => {
    const res = mockRes();
    sendError(res, 'PACIENTE_NO_ENCONTRADO', 'No existe');
    expect(res.getStatus()).toBe(404);
  });

  it('SLOT_NO_DISPONIBLE → 409', () => {
    const res = mockRes();
    sendError(res, 'SLOT_NO_DISPONIBLE', 'Ocupado');
    expect(res.getStatus()).toBe(409);
  });

  it('NO_SLOTS → 200 (not an HTTP error)', () => {
    const res = mockRes();
    sendError(res, 'NO_SLOTS', 'Sin disponibilidad', { accion_sugerida: 'ampliar_rango' });
    expect(res.getStatus()).toBe(200);
    expect((res.getBody() as any).accion_sugerida).toBe('ampliar_rango');
    expect((res.getBody() as any).success).toBe(false);
  });

  it('DRICLOUD_ERROR → 500', () => {
    const res = mockRes();
    sendError(res, 'DRICLOUD_ERROR', 'Error upstream');
    expect(res.getStatus()).toBe(500);
  });

  it('includes accion_sugerida only when provided', () => {
    const res = mockRes();
    sendError(res, 'DATOS_INCOMPLETOS', 'x');
    expect((res.getBody() as any).accion_sugerida).toBeUndefined();
  });
});
