// Utilidades HTTP compartidas por las rutas de Kuota Payments.
import type { Request, Response } from 'express';

export interface MerchantAuth {
  merchantId: string;
  sessionId: string;
  deviceId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: MerchantAuth;
      rawBody?: Buffer;
    }
  }
}

/** Respuesta de error con el formato de la API: { error: { code, message, ... } }. */
export function fail(res: Response, status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return res.status(status).json({ error: { code, message, ...extra } });
}

export function clientIp(req: Request): string {
  return (req.ip || req.socket.remoteAddress || 'unknown').replace(/^::ffff:/, '');
}

export function headerString(req: Request, name: string): string | undefined {
  const v = req.headers[name.toLowerCase()];
  return typeof v === 'string' ? v : undefined;
}
