// Comercio de la petición para las rutas /merchants/me y /credit.
// En producción solo se acepta un X-Merchant-Id que exista: jamás se cae a otra cuenta.
// Fuera de producción se conserva la cuenta demo (mer_carlos) para el desarrollo.
import type { Request } from 'express';
import { db } from '../db/database.js';
import { config } from './config.js';

export async function getMerchantProfile(req: Request): Promise<any> {
  const claimed = req.headers['x-merchant-id'];
  const merchantId = typeof claimed === 'string' ? claimed : '';
  if (merchantId) {
    const m = await db.prepare('SELECT * FROM merchant_profiles WHERE id = ?').get(merchantId);
    if (m) return m;
  }
  if (!config.isProd) {
    let profile = await db.prepare("SELECT * FROM merchant_profiles WHERE id = 'mer_carlos'").get();
    if (!profile) profile = await db.prepare('SELECT * FROM merchant_profiles LIMIT 1').get();
    if (profile) return profile;
  }
  throw Object.assign(new Error('Comercio no encontrado. Vuelve a iniciar sesión.'), { status: 404, code: 'MERCHANT_NOT_FOUND' });
}
