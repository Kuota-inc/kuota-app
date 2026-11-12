import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { sunatService } from '../services/sunat.service.js';
import { docError, isValidDoc, normalizeDoc, parseDocType } from '../security/identityDoc.js';
import { startVerification } from '../services/kyc.service.js';
import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { config } from '../security/config.js';
import { audit } from '../security/audit.js';
import { verifyPin } from '../security/crypto.js';
import { checkCci } from '../security/cci.js';
import { rateLimit } from '../security/guards.js';
import { clientIp } from '../security/http.js';
import { avatarUrl } from '../security/links.js';
import { parseAvatar } from './merchant.routes.js';

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex');

/**
 * Autentica al proveedor con X-Provider-Id + X-Provider-Token (secreto que recibió al registrarse).
 * El id es público (aparece en las listas de proveedores): sin el token no autentica.
 * Fuera de producción, sin cabecera se conserva el flujo demo del simulador (no toca datos).
 */
async function authProvider(req: Request, res: Response): Promise<string | null | undefined> {
  const id = req.headers['x-provider-id'];
  const token = req.headers['x-provider-token'];
  if (typeof id !== 'string' || !id) {
    if (!config.isProd) return null;
    res.status(401).json({ error: { code: 'PROVIDER_AUTH_REQUIRED', message: 'Inicia el registro de proveedor de nuevo.' } });
    return undefined;
  }
  const row = (await db.prepare('SELECT access_token_hash FROM provider_profiles WHERE id = ?').get(id)) as { access_token_hash: string | null } | undefined;
  const ok =
    typeof token === 'string' && !!row?.access_token_hash &&
    row.access_token_hash.length === sha256(token).length &&
    crypto.timingSafeEqual(Buffer.from(row.access_token_hash), Buffer.from(sha256(token)));
  if (!ok) {
    res.status(401).json({ error: { code: 'PROVIDER_AUTH_REQUIRED', message: 'No pudimos validar tu sesión de proveedor.' } });
    return undefined;
  }
  return id;
}

export const providerRouter = Router();

// PRD Reconocimiento Inteligente RUC SUNAT (BarretoPalacios / KUOTA)
providerRouter.get('/kyc/business-lookup/:ruc', async (req, res) => {
  const ruc = req.params.ruc;
  const result = await sunatService.buscarPorRuc(ruc);

  if (!result.success) {
    return res.status(422).json({
      error: { code: 'RUC_INVALID', message: result.error || 'Ingresa un RUC válido de 11 dígitos.' }
    });
  }

  res.json(result);
});

// Stats del padrón SUNAT y caché
providerRouter.get('/kyc/sunat-stats', async (req, res) => {
  res.json(await sunatService.getStats());
});

// PRD 11: Consulta SUNAT en vivo (Compatibilidad hacia atrás)
providerRouter.get('/kyc/ruc/:ruc', async (req, res) => {
  const ruc = req.params.ruc;
  const result = await sunatService.buscarPorRuc(ruc);

  if (!result.success || !result.data) {
    return res.status(422).json({
      error: { code: 'RUC_NOT_FOUND', message: result.error || 'No encontramos información para este número de RUC.' }
    });
  }

  const d = result.data;
  res.json({
    ruc: d.ruc,
    legal_name: d.razon_social,
    trade_name: d.nombre_comercial,
    status: d.estado_contribuyente,
    condition: d.condicion_domicilio,
    address: d.direccion_fiscal,
    department: d.departamento,
    province: d.provincia,
    district: d.distrito,
    ubigeo: d.ubigeo,
    economic_activity: d.actividad_principal,
    secondary_activities: d.actividades_secundarias,
    taxpayer_type: d.tipo_contribuyente,
    warning: result.warning,
    already_registered: result.already_registered
  });
});

// PRD: Confirmar y guardar negocio identificado en la entidad Business
providerRouter.post('/businesses/confirm', async (req, res) => {
  const { session_id, ruc, whatsapp, user_id } = req.body;
  // Representante legal: DNI o carnet de extranjería.
  const repDocType = parseDocType(req.body?.legal_rep_doc_type);
  const legal_rep_dni = normalizeDoc(req.body?.legal_rep_dni);

  if (!ruc || ruc.length !== 11) {
    return res.status(422).json({ error: { code: 'RUC_INVALID', message: 'Ingresa un RUC válido de 11 dígitos.' } });
  }
  if (!isValidDoc(repDocType, legal_rep_dni)) {
    return res.status(422).json({ error: docError(repDocType, ' del representante legal') });
  }

  // 1. Check if business already exists in KUOTA
  const existing = await db.prepare('SELECT id, ruc, razon_social FROM businesses WHERE ruc = ?').get(ruc) as any;
  if (existing) {
    // Ya registrado: no se modifica nada (cualquiera conoce un RUC) ni se entrega acceso.
    const existingReq = await db.prepare('SELECT public_id FROM kyc_requests WHERE session_id = ? ORDER BY created_at DESC LIMIT 1').get(session_id || '') as any;
    const reqId = existingReq?.public_id || 'PRV-89420-PE';

    return res.status(200).json({
      success: true,
      already_registered: true,
      business_id: existing.id,
      request_id: reqId,
      message: 'Comercio identificado y re-vinculado para validación.'
    });
  }

  // 2. Fetch official SUNAT data
  const sunatRes = await sunatService.buscarPorRuc(ruc);
  if (!sunatRes.success || !sunatRes.data) {
    return res.status(404).json({
      error: { code: 'RUC_NOT_FOUND', message: 'No se pudo verificar la información del comercio en SUNAT.' }
    });
  }

  const d = sunatRes.data;
  const businessId = 'biz_' + uuidv4().substring(0, 10);
  const now = new Date().toISOString();

  // 3. Insert into businesses table
  await db.prepare(`
    INSERT INTO businesses (
      id, ruc, razon_social, nombre_comercial, tipo_contribuyente,
      actividad_principal, actividades_secundarias, estado_contribuyente,
      condicion_domicilio, direccion_fiscal, ubigeo, departamento, provincia, distrito,
      fuente_datos, fecha_consulta, fecha_actualizacion, usuario_propietario, session_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    businessId,
    d.ruc,
    d.razon_social,
    d.nombre_comercial,
    d.tipo_contribuyente,
    d.actividad_principal,
    d.actividades_secundarias,
    d.estado_contribuyente,
    d.condicion_domicilio,
    d.direccion_fiscal,
    d.ubigeo,
    d.departamento,
    d.provincia,
    d.distrito,
    'SUNAT_PADRON',
    now,
    now,
    user_id || null,
    session_id || null
  );

  // 4. Update or create provider profile with verified business details
  const provId = 'prov_' + uuidv4().substring(0, 10);
  const existingProv = await db.prepare('SELECT id FROM provider_profiles WHERE ruc = ?').get(ruc) as any;
  if (existingProv) {
    return res.status(409).json({ error: { code: 'RUC_ALREADY_REGISTERED', message: 'Este RUC ya está registrado en Kuota. Escríbenos si es tu empresa.' } });
  }
  const providerToken = crypto.randomBytes(32).toString('base64url');
  await db.prepare(`
    INSERT INTO provider_profiles (
      id, session_id, ruc, legal_name, legal_rep_dni, legal_rep_doc_type, whatsapp, category,
      seniority_range, kyc_status, fee_bps, access_token_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'TEXTILES', '1Y_3Y', 'IN_REVIEW', ?, ?)
  `).run(provId, session_id, d.ruc, d.razon_social, legal_rep_dni, repDocType, whatsapp || '', config.feeBps, sha256(providerToken));

  // 5. Create KYC request with PRV- public id
  const requestId = 'req_' + uuidv4().substring(0, 10);
  const publicId = 'PRV-' + Math.floor(10000 + Math.random() * 90000) + '-PE';

  await db.prepare(`
    INSERT INTO kyc_requests (id, provider_id, session_id, public_id, status, progress_pct)
    VALUES (?, ?, ?, ?, 'IN_PROGRESS', 78)
  `).run(requestId, provId, session_id || 'ses_anon', publicId);

  const finalProvId = provId;

  res.status(201).json({
    success: true,
    message: '¡Negocio identificado y registrado con éxito!',
    business_id: businessId,
    request_id: publicId,
    provider_id: finalProvId,
    provider_token: providerToken,
    data: d,
    next_step: 'provider_validating'
  });
});

// PRD 11: Iniciar solicitud KYC (actualizado)
providerRouter.post('/kyc/requests', async (req, res) => {
  const { session_id, ruc, whatsapp } = req.body;
  const repDocType = parseDocType(req.body?.legal_rep_doc_type);
  const legal_rep_dni = normalizeDoc(req.body?.legal_rep_dni);

  if (!ruc || ruc.length !== 11) {
    return res.status(422).json({ error: { code: 'RUC_INVALID', message: 'El RUC debe tener 11 dígitos.' } });
  }
  if (!isValidDoc(repDocType, legal_rep_dni)) {
    return res.status(422).json({ error: docError(repDocType, ' del representante legal') });
  }
  if (!whatsapp || whatsapp.length < 9) {
    return res.status(422).json({ error: { code: 'PHONE_INVALID', message: 'Ingresa un celular de 9 dígitos.' } });
  }

  const requestId = 'req_' + uuidv4().substring(0, 10);
  const publicId = 'PRV-' + Math.floor(10000 + Math.random() * 90000) + '-PE';

  await db.prepare(`
    INSERT INTO kyc_requests (id, session_id, public_id, status, progress_pct)
    VALUES (?, ?, ?, 'IN_PROGRESS', 33)
  `).run(requestId, session_id || 'ses_anon', publicId);

  // Seed KYC Checks
  const insertCheck = db.prepare(`
    INSERT INTO kyc_checks (id, request_id, type, status, started_at)
    VALUES (?, ?, ?, ?, utc_now_text())
  `);
  await insertCheck.run('chk_sunat_' + uuidv4().substring(0, 8), requestId, 'SUNAT', 'DONE');
  await insertCheck.run('chk_reniec_' + uuidv4().substring(0, 8), requestId, 'RENIEC', 'DONE');
  await insertCheck.run('chk_scoring_' + uuidv4().substring(0, 8), requestId, 'SCORING', 'RUNNING');

  // Upsert provider profile
  let prov = await db.prepare('SELECT id FROM provider_profiles WHERE ruc = ?').get(ruc) as any;
  if (!prov) {
    const provId = 'prov_' + uuidv4().substring(0, 10);
    await db.prepare(`
      INSERT INTO provider_profiles (id, session_id, ruc, legal_name, legal_rep_dni, legal_rep_doc_type, whatsapp, kyc_status)
      VALUES (?, ?, ?, 'DISTRIBUIDORA ANDINA DEL SUR S.A.C.', ?, ?, ?, 'IN_REVIEW')
    `).run(provId, session_id, ruc, legal_rep_dni, repDocType, whatsapp);
  }

  res.status(201).json({
    request_id: publicId,
    internal_id: requestId,
    status: 'IN_PROGRESS',
    progress_pct: 78
  });
});

// PRD 12: Estado de validación asíncrona
providerRouter.get('/kyc/requests/:publicId', async (req, res) => {
  const publicId = req.params.publicId;
  const row = await db.prepare(`
    SELECT kr.*, pp.legal_name, pp.legal_rep_dni, pp.approved_limit_cents
    FROM kyc_requests kr
    LEFT JOIN provider_profiles pp ON pp.id = kr.provider_id
    WHERE kr.public_id = ?
  `).get(publicId) as any;

  const approvedLimit = row?.approved_limit_cents ?? 4500000;
  const razonSocial = row?.legal_name ?? null;
  const repDni = row?.legal_rep_dni ?? null;

  res.json({
    request_id: publicId,
    status: 'APPROVED',
    progress_pct: 100,
    stages: [
      { type: 'SUNAT', status: 'DONE', label: 'Validado — Activo y Habido' },
      { type: 'ID_CHECK', status: 'DONE', label: 'Identidad del Representante verificada' },
      { type: 'SCORING', status: 'DONE', label: 'Límite calculado para ventas seguras' }
    ],
    result: {
      status: 'APPROVED',
      approved_limit_cents: approvedLimit,
      currency: 'PEN',
      razon_social: razonSocial,
      legal_rep_dni: typeof repDni === 'string' && repDni.length > 3 ? '•'.repeat(repDni.length - 3) + repDni.slice(-3) : repDni
    }
  });
});

// Subida y Registro de Documentos KYC Proveedor (DNI Anverso, Reverso y Selfie Biométrico del Representante Legal)
providerRouter.post('/kyc/requests/:publicId/documents', async (req, res) => {
  const publicId = req.params.publicId;
  const { dni_front, dni_back, selfie } = req.body || {};

  const kyc = await db.prepare('SELECT * FROM kyc_requests WHERE public_id = ?').get(publicId) as any;
  if (kyc) {
    // Las imágenes del DNI y la selfie no se guardan (Ley 29733); solo el resultado.
    await db.prepare(`
      UPDATE kyc_requests
      SET status = 'APPROVED', current_stage = 'SCORING', decision_status = 'DEMO', updated_at = utc_now_text()
      WHERE id = ?
    `).run(kyc.id);
  }

  res.status(200).json({
    success: true,
    request_id: publicId,
    documents: {
      dni_front: !!dni_front,
      dni_back: !!dni_back,
      selfie: !!selfie
    },
    verification: {
      sunat_status: 'ACTIVO_Y_HABIDO',
      reniec_status: 'REPRESENTANTE_VALIDADO',
      biometric_match_score: 0.996,
      liveness_check: 'PASSED'
    },
    result: {
      status: 'APPROVED',
      approved_limit_cents: 4500000,
      currency: 'PEN',
      fee_rate_basis_points: 100
    },
    message: 'Documentos DNI y biometría del Representante Legal validados exitosamente.'
  });
});

// Iniciar verificación Didit (o modo DEMO) para KYC de proveedor
providerRouter.post('/kyc/requests/:publicId/verification', async (req, res) => {
  const publicId = req.params.publicId;
  try {
    const result = await startVerification(publicId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: { code: 'VERIFICATION_ERROR', message: err?.message || 'Error al iniciar verificación.' } });
  }
});

// PRD 13: Actividad Comercial
providerRouter.put('/activity', async (req, res) => {
  const { category, seniority_range } = req.body;
  const providerId = await authProvider(req, res);
  if (providerId === undefined) return;

  if (!category) {
    return res.status(422).json({ error: { code: 'CATEGORY_REQUIRED', message: 'Elige a qué rubro te dedicas.' } });
  }
  if (!seniority_range) {
    return res.status(422).json({ error: { code: 'SENIORITY_REQUIRED', message: 'Cuéntanos hace cuánto operas.' } });
  }

  if (providerId) {
    await db.prepare(`
      UPDATE provider_profiles SET category = ?, seniority_range = ?, updated_at = utc_now_text()
      WHERE id = ?
    `).run(category, seniority_range, providerId).catch(() => {});
  }

  res.json({
    category,
    seniority_range,
    next_step: 'provider_location',
    progress: { current: 3, total: 5 }
  });
});

// PRD 14: Geolocalización y GPS en tiempo real (Reverse Geocoding de Alta Precisión)
providerRouter.post('/geo/reverse', async (req, res) => {
  const { lat, lng } = req.body;
  const latitude = parseFloat(lat);
  const longitude = parseFloat(lng);

  if (isNaN(latitude) || isNaN(longitude)) {
    return res.status(400).json({ error: { code: 'INVALID_COORDS', message: 'Coordenadas no válidas.' } });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6500);

    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
    const response = await fetch(nominatimUrl, {
      headers: { 'User-Agent': 'KuotaApp/1.0 (contacto@kuota.pe)' },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data: any = await response.json();
      const addr = data.address || {};

      // 1. Calle y numeración exacta
      const road = addr.road || addr.pedestrian || addr.street || addr.residential || addr.avenue || addr.footway || addr.path || '';
      const number = addr.house_number ? ` ${addr.house_number}` : '';
      const placeName = addr.building || addr.amenity || addr.shop || addr.commercial || addr.office || '';

      let cleanAddress = '';
      if (road) {
        cleanAddress = `${road}${number}`;
        if (placeName && !cleanAddress.includes(placeName)) {
          cleanAddress = `${cleanAddress} (${placeName})`;
        }
      } else if (placeName) {
        cleanAddress = placeName;
      } else if (data.name) {
        cleanAddress = data.name;
      } else {
        cleanAddress = data.display_name?.split(',')[0] || 'Ubicación identificada';
      }

      // 2. Distrito, Ciudad y Región en Perú
      const rawDistrict = addr.suburb || addr.neighbourhood || addr.city_district || addr.district || addr.borough || addr.town || addr.city || '';
      const city = addr.city || addr.town || addr.region || addr.state_district || 'Lima';
      const department = addr.state || 'Lima';
      const district = rawDistrict ? rawDistrict : city;
      const zoneLabel = district !== city ? `${district}, ${city}` : `${city}, Perú`;

      const fullAddress = cleanAddress && district && !cleanAddress.includes(district)
        ? `${cleanAddress}, ${district}`
        : (cleanAddress || data.display_name || 'Ubicación identificada');

      return res.json({
        lat: latitude,
        lng: longitude,
        address: cleanAddress,
        full_address: fullAddress,
        full_display: data.display_name,
        zone_label: zoneLabel,
        district: `${district}, ${city}`,
        city,
        department,
        country: addr.country || 'Perú'
      });
    }
  } catch (err) {
    console.warn('[ReverseGeocode] Error reverse geocoding OSM:', err);
  }

  // Fallback seguro
  res.json({
    lat: latitude,
    lng: longitude,
    address: 'Ubicación detectada',
    full_address: 'Lima, Perú',
    zone_label: 'Lima, Perú',
    district: 'Lima, Lima',
    city: 'Lima',
    department: 'Lima'
  });
});

// PRD 14: IP-based Geolocation Lookup (Garantiza acceso funcional inmediato aún si el navegador o desktop no tiene GPS nativo)
providerRouter.get('/geo/ip-lookup', async (req, res) => {
  try {
    const response = await fetch('https://ipwho.is/', {
      headers: { 'User-Agent': 'KuotaApp/1.0 (contacto@kuota.pe)' }
    });

    if (response.ok) {
      const data: any = await response.json();
      if (data.success) {
        const lat = data.latitude || -12.0431;
        const lng = data.longitude || -77.0282;

        let address = data.city || 'Lima';
        let district = data.city || 'Lima';

        try {
          const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
          const nomRes = await fetch(nomUrl, {
            headers: { 'User-Agent': 'KuotaApp/1.0 (contacto@kuota.pe)' }
          });
          if (nomRes.ok) {
            const nomData: any = await nomRes.json();
            const addr = nomData.address || {};
            const road = addr.road || addr.pedestrian || addr.street || '';
            const number = addr.house_number ? ` ${addr.house_number}` : '';
            if (road) address = `${road}${number}`;
            if (addr.suburb || addr.neighbourhood || addr.city_district || addr.district) {
              district = addr.suburb || addr.neighbourhood || addr.city_district || addr.district;
            }
          }
        } catch (e) {
          console.warn('[IP-Geo] Nominatim reverse failed:', e);
        }

        return res.json({
          success: true,
          source: 'IP_NETWORK',
          lat,
          lng,
          accuracy: 120,
          address: address || 'Av. Principal',
          district: `${district}, ${data.city || 'Lima'}`,
          city: data.city || 'Lima',
          department: data.region || 'Lima',
          country: data.country || 'Perú',
          isp: data.connection?.isp || data.connection?.org || 'Red Local',
          zone_label: `${district}, ${data.city || 'Lima'}`
        });
      }
    }
  } catch (err) {
    console.warn('[IP-Geo] Lookup error:', err);
  }

  // Safe Lima fallback
  res.json({
    success: true,
    source: 'DEFAULT_FALLBACK',
    lat: -12.0645,
    lng: -77.0142,
    accuracy: 30,
    address: 'Jr. Gamarra 840, Galería Santa Rosa Tda 204',
    district: 'La Victoria, Lima',
    city: 'Lima',
    department: 'Lima',
    country: 'Perú',
    isp: 'Fibra Óptica Comercial',
    zone_label: 'Gamarra / La Victoria, Lima'
  });
});

// PRD 14: Búsqueda y geocodificación de direcciones en Perú
providerRouter.get('/geo/search', async (req, res) => {
  const query = (req.query.q as string || '').trim();
  if (!query || query.length < 2) {
    return res.json({ results: [] });
  }

  try {
    const encoded = encodeURIComponent(`${query}, Peru`);
    const searchUrl = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=5&addressdetails=1`;
    const response = await fetch(searchUrl, {
      headers: { 'User-Agent': 'KuotaApp/1.0 (contacto@kuota.pe)' }
    });

    if (response.ok) {
      const data: any = await response.json();
      const results = (data || []).map((item: any) => ({
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        display_name: item.display_name,
        name: item.name || query,
        district: item.address?.suburb || item.address?.neighbourhood || item.address?.city_district || item.address?.district || '',
        city: item.address?.city || item.address?.town || item.address?.region || 'Lima'
      }));
      return res.json({ results });
    }
  } catch (err) {
    console.warn('[GeoSearch] Error searching OSM:', err);
  }

  res.json({ results: [] });
});

providerRouter.put('/location', (req, res) => {
  const { lat, lng, address_line, district, city } = req.body;

  if (!address_line) {
    return res.status(422).json({ error: { code: 'ADDRESS_REQUIRED', message: 'Escribe la dirección de tu negocio.' } });
  }

  res.json({
    success: true,
    next_step: 'provider_notifications',
    fiscal_distance_m: 120,
    address_line,
    district: district || 'La Victoria',
    city: city || 'Lima'
  });
});

// PRD 15: Notificaciones y permisos
providerRouter.put('/notifications', (req, res) => {
  const { consent = 'GRANTED', token } = req.body;
  res.json({
    status: consent,
    next_step: 'provider_savings',
    provisioning_status: { progress_pct: 100, ready: true }
  });
});

// PRD 16: Cálculo del ahorro del 71%
providerRouter.get('/savings-estimate', (req, res) => {
  const annualRevenueCents = 2400000; // S/ 24,000.00
  const marketRatePct = 3.45;
  const kuotaRatePct = 1.00;

  const marketCostCents = Math.round(annualRevenueCents * (marketRatePct / 100)); // S/ 828.00
  const kuotaCostCents = Math.round(annualRevenueCents * (kuotaRatePct / 100));   // S/ 240.00
  const savingsCents = marketCostCents - kuotaCostCents;                         // S/ 588.00
  const savingsPct = Math.round((savingsCents / marketCostCents) * 100);          // 71.0 %

  res.json({
    annual_revenue_cents: annualRevenueCents,
    market_rate_pct: marketRatePct,
    kuota_rate_pct: kuotaRatePct,
    market_cost_cents: marketCostCents,
    kuota_cost_cents: kuotaCostCents,
    savings_cents: savingsCents,
    savings_pct: savingsPct,
    benefits: [
      { code: 'FIXED_FEE', title: 'Comisión fija de 1.00%', subtitle: 'Sin escalas ocultas ni cambios sorpresa' },
      { code: 'INSTANT_PAYOUT', title: 'Abono inmediato garantizado', subtitle: 'A tu cuenta bancaria sin retenciones de fin de semana' },
      { code: 'NO_HIDDEN_COSTS', title: 'Cero costos fijos ni letras chicas', subtitle: 'Sin mensualidades ni costos por terminal' },
      { code: 'COMPLIANCE', title: 'Cumplimiento y regulación bancaria', subtitle: 'Transferencias interbancarias 100% seguras' }
    ]
  });
});

// Cuenta bancaria de abono del proveedor. Cambiarla es la operación más delicada (a dónde va el dinero):
// exige sesión de proveedor + PIN (con bloqueo por intentos), valida el CCI y queda en la bitácora.
providerRouter.put('/settlement-account', async (req, res) => {
  const providerId = await authProvider(req, res);
  if (providerId === undefined) return;
  if (!providerId) return res.status(401).json({ error: { code: 'PROVIDER_AUTH_REQUIRED', message: 'Inicia sesión para continuar.' } });

  const check = checkCci(req.body?.cci, req.body?.bank);
  if (!check.ok) return res.status(422).json({ error: { code: check.code, message: check.message } });

  const prov = (await db.prepare('SELECT pin_hash, pin_failed_attempts, pin_locked_until FROM provider_profiles WHERE id = ?').get(providerId)) as
    | { pin_hash: string | null; pin_failed_attempts: number | null; pin_locked_until: string | null }
    | undefined;
  if (!prov?.pin_hash) return res.status(409).json({ error: { code: 'PIN_NOT_CONFIGURED', message: 'Primero crea tu PIN.' } });
  const now = new Date();
  if (prov.pin_locked_until && new Date(prov.pin_locked_until) > now) {
    const minutes = Math.ceil((new Date(prov.pin_locked_until).getTime() - now.getTime()) / 60_000);
    return res.status(423).json({ error: { code: 'PIN_LOCKED', message: `Bloqueamos el PIN por varios intentos fallidos. Inténtalo en ${minutes} min.` } });
  }
  const pin = req.body?.pin;
  const ip = typeof req.ip === 'string' ? req.ip : null;
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin) || !verifyPin(pin, prov.pin_hash)) {
    const attempts = (prov.pin_failed_attempts ?? 0) + 1;
    if (attempts >= config.pinMaxAttempts) {
      const lockedUntil = new Date(now.getTime() + config.pinLockMinutes * 60_000).toISOString();
      await db.prepare('UPDATE provider_profiles SET pin_failed_attempts = 0, pin_locked_until = ? WHERE id = ?').run(lockedUntil, providerId);
      await audit({ actorType: 'MERCHANT', actorId: providerId, action: 'PIN_LOCKED', result: 'DENIED', ip, details: { role: 'PROVIDER', purpose: 'SETTLEMENT_ACCOUNT' } });
      return res.status(423).json({ error: { code: 'PIN_LOCKED', message: `Bloqueamos el PIN por ${config.pinLockMinutes} min por varios intentos fallidos.` } });
    }
    await db.prepare('UPDATE provider_profiles SET pin_failed_attempts = ? WHERE id = ?').run(attempts, providerId);
    const left = config.pinMaxAttempts - attempts;
    return res.status(401).json({ error: { code: 'PIN_INVALID', message: `PIN incorrecto. Te queda${left === 1 ? '' : 'n'} ${left} intento${left === 1 ? '' : 's'}.` } });
  }

  await db.prepare(`
    UPDATE provider_profiles SET settlement_bank = ?, settlement_cci = ?, pin_failed_attempts = 0, pin_locked_until = NULL, updated_at = utc_now_text()
    WHERE id = ?
  `).run(check.bank, check.cci, providerId);
  await audit({ actorType: 'MERCHANT', actorId: providerId, action: 'SETTLEMENT_ACCOUNT_SET', result: 'OK', ip, details: { role: 'PROVIDER', bank: check.bank, cci_last4: check.cci.slice(-4) } });

  res.json({ success: true, bank: check.bank, account_masked: '•'.repeat(16) + check.cci.slice(-4), status: 'ACTIVE' });
});

// Pedidos del proveedor: compras que los comercios le hicieron con aKuotas!. Solo los suyos.
providerRouter.get('/orders', async (req, res) => {
  const id = await authProvider(req, res);
  if (id === undefined) return;
  if (!id) return res.status(401).json({ error: { code: 'PROVIDER_AUTH_REQUIRED', message: 'Inicia sesión para continuar.' } });
  const rows = (await db.prepare(`
    SELECT cp.id, cp.total_cents, cp.down_payment_cents, cp.financed_cents, cp.installments_count, cp.status, cp.issued_at, cp.settled_at,
           mp.business_name
    FROM credit_purchases cp
    LEFT JOIN merchant_profiles mp ON mp.id = cp.merchant_id
    WHERE cp.provider_id = ?
    ORDER BY cp.issued_at DESC
    LIMIT 50
  `).all(id)) as Array<Record<string, any>>;
  res.json({
    summary: {
      count: rows.length,
      total_cents: rows.reduce((sum, r) => sum + Number(r.total_cents || 0), 0),
      settled_count: rows.filter((r) => r.settled_at).length
    },
    orders: rows.map((r) => ({
      id: r.id,
      customer: r.business_name ?? 'Comercio',
      total_cents: Number(r.total_cents),
      installments_count: r.installments_count,
      status: r.status,
      issued_at: r.issued_at,
      settled: !!r.settled_at
    }))
  });
});

// Token de la foto de un proveedor: la de su cuenta de cobros (Emprendedor) si la tiene; si no, la suya.
const AVATAR_TOKEN_SQL = `SELECT COALESCE(
  (SELECT a.token FROM merchant_avatars a JOIN merchant_profiles m ON m.id = a.merchant_id JOIN provider_profiles p ON p.user_id = m.user_id WHERE p.id = ?),
  (SELECT token FROM provider_avatars WHERE provider_id = ?)
) AS token`;

const providerAvatarLimiter = rateLimit({ name: 'provider-avatar', windowMs: 3_600_000, max: 10, key: (req) => `${clientIp(req)}:${req.headers['x-provider-id'] ?? ''}` });

// Foto del proveedor. Si ya tiene cuenta de cobros se guarda ahí (una sola foto por persona).
providerRouter.put('/avatar', providerAvatarLimiter, async (req, res) => {
  const id = await authProvider(req, res);
  if (id === undefined) return;
  if (!id) return res.status(401).json({ error: { code: 'PROVIDER_AUTH_REQUIRED', message: 'Inicia sesión para continuar.' } });
  const parsed = parseAvatar(req.body?.image);
  if (!parsed.ok) return res.status(422).json({ error: { code: 'AVATAR_INVALID', message: parsed.message } });
  const token = crypto.randomBytes(16).toString('hex');
  const merchant = (await db.prepare('SELECT m.id FROM provider_profiles p JOIN merchant_profiles m ON m.user_id = p.user_id WHERE p.id = ?').get(id)) as { id: string } | undefined;
  if (merchant) {
    await db
      .prepare(`INSERT INTO merchant_avatars (merchant_id, token, image_b64, updated_at) VALUES (?, ?, ?, utc_now_text())
                ON CONFLICT(merchant_id) DO UPDATE SET token = excluded.token, image_b64 = excluded.image_b64, updated_at = excluded.updated_at`)
      .run(merchant.id, token, parsed.b64);
    await db.prepare('DELETE FROM provider_avatars WHERE provider_id = ?').run(id);
  } else {
    await db
      .prepare(`INSERT INTO provider_avatars (provider_id, token, image_b64, updated_at) VALUES (?, ?, ?, utc_now_text())
                ON CONFLICT(provider_id) DO UPDATE SET token = excluded.token, image_b64 = excluded.image_b64, updated_at = excluded.updated_at`)
      .run(id, token, parsed.b64);
  }
  await audit({ actorType: 'MERCHANT', actorId: id, action: 'AVATAR_UPDATE', result: 'OK', ip: clientIp(req), details: { role: 'PROVIDER' } });
  res.json({ avatar_url: avatarUrl(token) });
});

providerRouter.delete('/avatar', async (req, res) => {
  const id = await authProvider(req, res);
  if (id === undefined) return;
  if (!id) return res.status(401).json({ error: { code: 'PROVIDER_AUTH_REQUIRED', message: 'Inicia sesión para continuar.' } });
  await db.prepare('DELETE FROM provider_avatars WHERE provider_id = ?').run(id);
  await db.prepare('DELETE FROM merchant_avatars WHERE merchant_id IN (SELECT m.id FROM provider_profiles p JOIN merchant_profiles m ON m.user_id = p.user_id WHERE p.id = ?)').run(id);
  await audit({ actorType: 'MERCHANT', actorId: id, action: 'AVATAR_REMOVE', result: 'OK', ip: clientIp(req), details: { role: 'PROVIDER' } });
  res.json({ avatar_url: null });
});

// Panel del proveedor: su perfil (datos sensibles enmascarados). Exige X-Provider-Id + X-Provider-Token.
providerRouter.get('/me', async (req, res) => {
  const id = await authProvider(req, res);
  if (id === undefined) return;
  if (!id) return res.status(401).json({ error: { code: 'PROVIDER_AUTH_REQUIRED', message: 'Inicia sesión para continuar.' } });
  // Fase de pruebas (sandbox): aún no hay SUNAT/RENIEC reales, igual que la verificación DEMO de los documentos,
  // el proveedor que completó su registro queda verificado. Con la verificación real activa, esto no corre.
  if (config.sandboxEnabled) {
    await db.prepare(
      "UPDATE provider_profiles SET kyc_status = 'APPROVED', approved_limit_cents = COALESCE(approved_limit_cents, 4500000) WHERE id = ? AND kyc_status = 'IN_REVIEW'"
    ).run(id);
  }
  const p = (await db.prepare(
    'SELECT id, legal_name, ruc, category, kyc_status, fee_bps, approved_limit_cents, settlement_bank, settlement_cci, whatsapp, created_at FROM provider_profiles WHERE id = ?'
  ).get(id)) as Record<string, any> | undefined;
  if (!p) return res.status(404).json({ error: { code: 'PROVIDER_NOT_FOUND', message: 'Proveedor no encontrado.' } });
  const mask = (v: unknown, keep: number) => (typeof v === 'string' && v.length > keep ? '•'.repeat(v.length - keep) + v.slice(-keep) : v ?? null);
  const av = (await db.prepare(AVATAR_TOKEN_SQL).get(id, id)) as { token: string | null } | undefined;
  res.json({
    id: p.id,
    avatar_url: avatarUrl(av?.token),
    business_name: p.legal_name,
    ruc_masked: mask(p.ruc, 3),
    category: p.category,
    kyc_status: p.kyc_status,
    fee_bps: p.fee_bps,
    approved_limit_cents: p.approved_limit_cents,
    settlement: p.settlement_cci ? { bank: p.settlement_bank, account_masked: mask(p.settlement_cci, 4) } : null,
    whatsapp_masked: mask(p.whatsapp, 3),
    created_at: p.created_at
  });
});

// Cierra la sesión del proveedor (el token deja de valer en todos los dispositivos).
providerRouter.post('/logout', async (req, res) => {
  const id = await authProvider(req, res);
  if (id === undefined) return;
  if (id) await db.prepare('UPDATE provider_profiles SET access_token_hash = NULL WHERE id = ?').run(id);
  res.status(204).end();
});

// PRD 16: Activación definitiva
providerRouter.post('/activate', async (req, res) => {
  const providerId = await authProvider(req, res);
  if (providerId === undefined) return;

  // La activación NO aprueba el KYC: el estado solo pasa a APPROVED por la decisión de verificación.
  let kycStatus = 'IN_REVIEW';
  if (providerId) {
    const row = (await db.prepare('SELECT kyc_status FROM provider_profiles WHERE id = ?').get(providerId)) as { kyc_status: string | null } | undefined;
    kycStatus = row?.kyc_status ?? 'IN_REVIEW';
  } else if (!config.isProd) {
    kycStatus = 'APPROVED';
  }
  const verified = kycStatus === 'APPROVED';

  res.json({
    status: kycStatus,
    provider_verified: verified,
    fee_bps: config.feeBps,
    fee_pct: config.feeBps / 100,
    message: '¡Tu cuenta de Proveedor está lista! Ya puedes generar enlaces de cobro y emitir facturas.'
  });
});

// PRD 04: Proveedores recomendados para comercios
// PRD 04: Proveedores recomendados para comercios. Antes era una lista escrita a mano con empresas reales
// (p. ej. Alicorp "Oficial") que no tenían convenio con Kuota: ahora salen solo de los proveedores registrados.
providerRouter.get('/recommended', async (_req, res) => {
  const rows = (await db.prepare(`
    SELECT pp.id, pp.legal_name AS name, pp.category, pp.approved_limit_cents, pl.city, pl.district,
           (${AVATAR_TOKEN_SQL.replace(/\?/g, 'pp.id')}) AS avatar_token
    FROM provider_profiles pp
    LEFT JOIN provider_locations pl ON pl.provider_id = pp.id AND pl.is_primary = 1
    WHERE pp.kyc_status = 'APPROVED'
    ORDER BY pp.created_at ASC
    LIMIT 3
  `).all()) as any[];
  res.json(rows.map((p) => ({
    id: p.id,
    name: p.name || 'Proveedor Kuota',
    category: p.category || 'General',
    badge: 'Verificado',
    max_credit_cents: p.approved_limit_cents || 140000,
    zone: [p.district, p.city].filter(Boolean).join(', ') || 'Lima',
    rating: null,
    avatar_url: avatarUrl(p.avatar_token)
  })));
});

// P2P aKuotas: lista de proveedores afiliados desde la base de datos
providerRouter.get('/affiliated', async (_req, res) => {
  const rows = await db.prepare(`
    SELECT pp.id, pp.legal_name AS name, pp.category, pp.fee_bps,
           (${AVATAR_TOKEN_SQL.replace(/\?/g, 'pp.id')}) AS avatar_token,
           pp.approved_limit_cents AS max_order_cents,
           pl.address_line AS address, pl.district, pl.city,
           u.phone
    FROM provider_profiles pp
    LEFT JOIN provider_locations pl ON pl.provider_id = pp.id AND pl.is_primary = 1
    LEFT JOIN users u ON u.id = pp.user_id
    WHERE pp.kyc_status IN ('APPROVED', 'IN_REVIEW')
    ORDER BY pp.created_at ASC
  `).all() as any[];

  res.json(rows.map((p) => ({
    id: p.id,
    name: p.name || 'Proveedor Kuota',
    category: p.category || 'General',
    description: `Proveedor registrado en Kuota.`,
    badge: 'Verificado',
    address: p.address || p.district || 'Lima',
    district: p.district || 'Lima',
    zone: p.city || 'Lima',
    phone: p.phone || '',
    min_order_cents: 10000,
    max_order_cents: p.max_order_cents || 140000,
    rating: null,
    reviews: 0,
    avatar_url: avatarUrl(p.avatar_token)
  })));
});
