import type { Response } from 'express';

export type GhlErrorCode =
  | 'DATOS_INCOMPLETOS'
  | 'API_KEY_INVALIDA'
  | 'PACIENTE_NO_ENCONTRADO'
  | 'SLOT_NO_DISPONIBLE'
  | 'NO_SLOTS'
  | 'DRICLOUD_ERROR';

const HTTP_STATUS: Record<GhlErrorCode, number> = {
  DATOS_INCOMPLETOS: 400,
  API_KEY_INVALIDA: 401,
  PACIENTE_NO_ENCONTRADO: 404,
  SLOT_NO_DISPONIBLE: 409,
  NO_SLOTS: 200,
  DRICLOUD_ERROR: 500,
};

export function sendError(
  res: Response,
  codigo_error: GhlErrorCode,
  mensaje: string,
  opts?: { accion_sugerida?: string },
): void {
  const body: Record<string, unknown> = { success: false, codigo_error, mensaje };
  if (opts?.accion_sugerida) body.accion_sugerida = opts.accion_sugerida;
  res.status(HTTP_STATUS[codigo_error]).json(body);
}
