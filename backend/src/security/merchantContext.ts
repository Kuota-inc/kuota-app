// Comercio de la petición para las rutas /merchants/me y /credit.
// El id (X-Merchant-Id) solo dice QUIÉN dice ser; lo que lo prueba es el token de identidad del
// dispositivo (X-Merchant-Token + X-Device-Id), obligatorio en producción.
// Fuera de producción se conserva la cuenta demo (mer_carlos) para el desarrollo.
import type { Request } from 'express';
import { db } from '../db/database.js';
import { config } from './config.js';
import { merchantTokenRequired, verifyIdentityToken } from './auth.js';

export const authRequired = () =>
  Object.assign(new Error('Tu sesión no es válida. Vuelve a iniciar sesión.'), { status: 401, code: 'MERCHANT_AUTH_REQUIRED' });

export async function getMerchantProfile(req: Request): Promise<any> {
  const claimed = req.headers['x-merchant-id'];
  const merchantId = typeof claimed === 'string' ? claimed : '';
  if (merchantId) {
    const m = (await db.prepare('SELECT * FROM merchant_profiles WHERE id = ?').get(merchantId)) as { id: string } | undefined;
    if (m) {
      if (merchantTokenRequired() && !(await verifyIdentityToken(req, m.id))) throw authRequired();
      return m;
    }
  }
  if (!config.isProd) {
    let profile = await db.prepare("SELECT * FROM merchant_profiles WHERE id = 'mer_carlos'").get();
    if (!profile) profile = await db.prepare('SELECT * FROM merchant_profiles LIMIT 1').get();
    if (profile) return profile;
  }
  throw Object.assign(new Error('Comercio no encontrado. Vuelve a iniciar sesión.'), { status: 404, code: 'MERCHANT_NOT_FOUND' });
}
