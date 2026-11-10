import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { sunatService } from '../services/sunat.service.js';
import { hashPin, pinProblem } from '../security/crypto.js';
import { credentialFor, isValidDeviceId, issueIdentityToken, linkDevice, setMerchantPinHash } from '../security/auth.js';
import { clientIp, headerString } from '../security/http.js';
import { getKycByPublicId, refreshFromProvider, startVerification } from '../services/kyc.service.js';
import { DiditError, diditEnabled } from '../integrations/didit.js';
import { config } from '../security/config.js';

// El id de solicitud (MER-12345-PE) es adivinable: estas rutas solo devuelven datos enmascarados.
const maskTail = (v: unknown, keep: number) => (typeof v === 'string' && v.length > keep ? '•'.repeat(v.length - keep) + v.slice(-keep) : v ?? null);

export const onboardingRouter = Router();

// Helper para auto-asegurar la existencia de la sesión (idempotente y resiliente ante sesiones optimistas)
async function ensureSession(sessionId: string, role: 'MERCHANT' | 'PROVIDER' = 'MERCHANT', allowCompleted = false) {
  let session = await db.prepare('SELECT * FROM onboarding_sessions WHERE id = ?').get(sessionId) as any;
  if (!session) {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const nextStep = role === 'MERCHANT' ? 'merchant_identity' : 'provider_fiscal';
    await db.prepare(`
      INSERT INTO onboarding_sessions (id, role, device_id, status, current_step, terms_version, privacy_version, accepted_at, expires_at)
      VALUES (?, ?, 'dev_auto', 'IN_PROGRESS', ?, '2026.1', '2026.1', utc_now_text(), ?)
    `).run(sessionId, role, nextStep, expiresAt);
    session = await db.prepare('SELECT * FROM onboarding_sessions WHERE id = ?').get(sessionId) as any;
  }
  // Una sesión cerrada ya creó la cuenta: reescribir sus datos (DNI, negocio, productos) sería tomarla.
  if (session.status === 'COMPLETED' && !allowCompleted) {
    throw Object.assign(new Error('Este registro ya fue completado. Inicia sesión.'), { status: 409, code: 'SESSION_COMPLETED' });
  }
  return session;
}

// PRD 01: Crear sesión de onboarding
onboardingRouter.post('/sessions', async (req, res) => {
  const { role, device_id, accepted_terms_version, accepted_privacy_version } = req.body;

  if (!role || !['MERCHANT', 'PROVIDER'].includes(role)) {
    return res.status(422).json({
      error: { code: 'ROLE_INVALID', message: 'Elige un perfil válido (MERCHANT o PROVIDER).' }
    });
  }

  const termsVer = accepted_terms_version || '2026.1';
  const privVer = accepted_privacy_version || '2026.1';

  const sessionId = 'ses_' + uuidv4().substring(0, 12);
  const nextStep = role === 'MERCHANT' ? 'merchant_identity' : 'provider_fiscal';
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await db.prepare(`
    INSERT INTO onboarding_sessions (id, role, device_id, status, current_step, terms_version, privacy_version, accepted_at, expires_at)
    VALUES (?, ?, ?, 'IN_PROGRESS', ?, ?, ?, utc_now_text(), ?)
  `).run(sessionId, role, device_id || 'dev_unknown', nextStep, termsVer, privVer, expiresAt);

  res.status(201).json({
    session_id: sessionId,
    role,
    next_step: nextStep,
    expires_at: expiresAt
  });
});

// Sugerencia de nombre por DNI. NO es una consulta a RENIEC (requiere convenio o un
// proveedor autorizado): solo conoce los DNI de demostración y nunca inventa nombres.
// La identidad real se verifica después con Didit (documento + prueba de vida).
const DNI_NAMES: Record<string, string> = {
  '47891234': 'CARLOS ALBERTO MENDOZA QUISPE',
  '70123456': 'MARÍA FERNANDA ROJAS SILVA',
  '10456789': 'LUIS ENRIQUE CONDORI PAREDES',
  '45678901': 'ANA PATRICIA CHÁVEZ HUAMÁN',
  '40234567': 'JORGE EDUARDO FLORES MAMANI',
  '72345678': 'LILIANA BEATRIZ ZÚÑIGA SÁNCHEZ'
};

onboardingRouter.get('/reniec/:dni', (req, res) => {
  const dni = req.params.dni;
  if (!dni || !/^\d{8}$/.test(dni)) {
    return res.status(422).json({ error: { code: 'DNI_INVALID', message: 'El DNI debe tener 8 dígitos numéricos.' } });
  }

  const fullName = process.env.NODE_ENV === 'production' ? undefined : DNI_NAMES[dni];
  if (!fullName) {
    return res.status(404).json({ error: { code: 'DNI_NOT_FOUND', message: 'No tenemos un nombre sugerido para ese DNI.' } });
  }
  res.json({ success: true, dni, full_name: fullName, source: 'DEMO' });
});

// Solicitud de datos de identidad del Emprendedor (Soporta Personal [KYC] y Business [KYB + KYC])
onboardingRouter.post('/sessions/:id/merchant-identity', async (req, res) => {
  const sessionId = req.params.id;
  const { account_type = 'PERSONAL', ruc, dni, full_name, phone, whatsapp_opt_in = true } = req.body;

  if (!dni || !/^\d{8}$/.test(dni)) {
    return res.status(422).json({ error: { code: 'DNI_INVALID', message: 'Ingresa un DNI peruano válido de 8 dígitos.' } });
  }
  if (!full_name || full_name.trim().length < 3) {
    return res.status(422).json({ error: { code: 'NAME_REQUIRED', message: 'Ingresa los nombres y apellidos completos.' } });
  }
  if (!phone || !/^\d{9}$/.test(phone.replace(/\s+/g, ''))) {
    return res.status(422).json({ error: { code: 'PHONE_INVALID', message: 'Ingresa un celular peruano de 9 dígitos.' } });
  }

  const session = await ensureSession(sessionId, 'MERCHANT');

  const cleanPhone = phone.replace(/\s+/g, '');
  let businessData: any = null;

  // Si es cuenta BUSINESS: Ejecutar validación KYB con SUNAT
  if (account_type === 'BUSINESS') {
    if (!ruc || ruc.length !== 11) {
      return res.status(422).json({ error: { code: 'RUC_INVALID', message: 'Para registrar un negocio ingresa un RUC válido de 11 dígitos.' } });
    }

    const sunatRes = await sunatService.buscarPorRuc(ruc);
    if (!sunatRes.success || !sunatRes.data) {
      return res.status(404).json({ error: { code: 'RUC_NOT_FOUND', message: sunatRes.error || 'No se pudo verificar la empresa en SUNAT.' } });
    }
    businessData = sunatRes.data;

    // Registrar o actualizar en la tabla businesses (KYB)
    const existingBiz = await db.prepare('SELECT id FROM businesses WHERE ruc = ?').get(ruc) as any;
    const businessId = existingBiz ? existingBiz.id : 'biz_' + uuidv4().substring(0, 10);
    const now = new Date().toISOString();

    if (!existingBiz) {
      await db.prepare(`
        INSERT INTO businesses (
          id, ruc, razon_social, nombre_comercial, tipo_contribuyente,
          actividad_principal, actividades_secundarias, estado_contribuyente,
          condicion_domicilio, direccion_fiscal, ubigeo, departamento, provincia, distrito,
          fuente_datos, fecha_consulta, fecha_actualizacion, session_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        businessId,
        businessData.ruc,
        businessData.razon_social,
        businessData.nombre_comercial,
        businessData.tipo_contribuyente,
        businessData.actividad_principal,
        businessData.actividades_secundarias,
        businessData.estado_contribuyente,
        businessData.condicion_domicilio,
        businessData.direccion_fiscal,
        businessData.ubigeo,
        businessData.departamento,
        businessData.provincia,
        businessData.distrito,
        'SUNAT_PADRON',
        now,
        now,
        sessionId
      );
    }
  }

  const existing = await db.prepare('SELECT id FROM merchant_profiles WHERE session_id = ?').get(sessionId) as any;
  let merchantId = existing?.id;
  const bName = businessData ? businessData.razon_social : (existing?.business_name || 'Mi Negocio Kuota');
  const bRuc = businessData ? businessData.ruc : null;
  const bAddress = businessData ? businessData.direccion_fiscal : null;
  const bDistrict = businessData ? businessData.distrito : null;

  if (existing) {
    await db.prepare(`
      UPDATE merchant_profiles
      SET dni = ?, full_name = ?, phone = ?, ruc_verified = (ruc_verified OR ? IS NOT NULL), ruc = coalesce(?, ruc), business_name = coalesce(?, business_name),
          address = coalesce(?, address), district = coalesce(?, district), kyc_status = 'IN_PROGRESS', updated_at = utc_now_text()
      WHERE session_id = ?
    `).run(dni, full_name.trim().toUpperCase(), cleanPhone, bRuc, bRuc, bName, bAddress, bDistrict, sessionId);
  } else {
    merchantId = 'mer_' + uuidv4().substring(0, 10);
    await db.prepare(`
      INSERT INTO merchant_profiles (id, session_id, dni, full_name, phone, ruc, business_name, address, district, kyc_status, ruc_verified, payments_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS', ?, FALSE)
    `).run(merchantId, sessionId, dni, full_name.trim().toUpperCase(), cleanPhone, bRuc, bName, bAddress, bDistrict, bRuc !== null);
  }

  // Generar ID público de solicitud: BIZ-XXXXX-PE si es Business, MER-XXXXX-PE si es Personal
  const requestId = 'req_' + uuidv4().substring(0, 10);
  const publicId = (account_type === 'BUSINESS' ? 'BIZ-' : 'MER-') + Math.floor(10000 + Math.random() * 90000) + '-PE';

  await db.prepare(`
    INSERT INTO kyc_requests (id, session_id, public_id, status, progress_pct)
    VALUES (?, ?, ?, 'IN_PROGRESS', 33)
  `).run(requestId, sessionId, publicId);

  // Crear checks de validación (KYB + KYC)
  const insertCheck = db.prepare(`
    INSERT INTO kyc_checks (id, request_id, type, status, started_at)
    VALUES (?, ?, ?, ?, utc_now_text())
  `);

  if (account_type === 'BUSINESS') {
    await insertCheck.run('chk_' + uuidv4().substring(0, 8), requestId, 'SUNAT', 'PENDING');
  }
  await insertCheck.run('chk_' + uuidv4().substring(0, 8), requestId, 'RENIEC', 'PENDING');
  await insertCheck.run('chk_' + uuidv4().substring(0, 8), requestId, 'SCORING', 'PENDING');

  await db.prepare("UPDATE onboarding_sessions SET current_step = 'merchant_kyc_validating' WHERE id = ?").run(sessionId);

  res.status(201).json({
    success: true,
    account_type,
    request_id: publicId,
    dni,
    full_name: full_name.trim().toUpperCase(),
    phone: cleanPhone,
    business: businessData || null,
    next_step: 'merchant_kyc_validating'
  });
});

// Estado de validación KYC & KYB del Emprendedor / Comercio
onboardingRouter.get('/merchant-kyc/:requestId', async (req, res) => {
  const publicId = req.params.requestId;
  const kyc = await db.prepare('SELECT * FROM kyc_requests WHERE public_id = ?').get(publicId) as any;

  if (!kyc) {
    // En producción no existe el comercio demo: un id desconocido es un 404, nunca una aprobación.
    if (config.isProd) return res.status(404).json({ error: { code: 'KYC_NOT_FOUND', message: 'Solicitud de verificación no encontrada.' } });
    return res.json({
      request_id: publicId,
      account_type: 'PERSONAL',
      status: 'APPROVED',
      progress_pct: 100,
      merchant: {
        dni: '47891234',
        full_name: 'CARLOS ALBERTO MENDOZA QUISPE',
        phone: '987654321',
        business_name: 'Bodega San Martín'
      },
      stages: [
        { type: 'RENIEC', status: 'DONE', title: 'Identidad del Titular (RENIEC)', label: 'Identidad validada con Reniec — Ciudadano Hábil' },
        { type: 'ANTIFRAUD', status: 'DONE', title: 'Validación Celular y Antifraude', label: 'Verificación biométrica y titularidad de línea móvil' },
        { type: 'SCORING', status: 'DONE', title: 'Microcrédito Ágil Kuota', label: 'Evaluación crediticia ágil — Aprobado Nivel 1' }
      ],
      result: {
        status: 'APPROVED',
        approved_limit_cents: 140000,
        approved_level: 1,
        currency: 'PEN',
        initial_rate_pct: 0
      }
    });
  }

  const merchant = await db.prepare('SELECT * FROM merchant_profiles WHERE session_id = ?').get(kyc.session_id) as any;

  // Verificación real con Didit: el estado sale de su decisión, no de una simulación.
  if (kyc.provider === 'DIDIT') {
    const fresh = (await refreshFromProvider(kyc)) as any;
    const done = (s: string) => (fresh.status === 'APPROVED' ? 'DONE' : fresh.status === 'REJECTED' ? 'FAILED' : s);
    return res.json({
      request_id: fresh.public_id,
      provider: 'DIDIT',
      status: fresh.status,
      reason: fresh.decision_reason,
      progress_pct: fresh.progress_pct,
      verification_url: fresh.status === 'IN_PROGRESS' ? fresh.verification_url : null,
      merchant: { dni: maskTail(merchant?.dni, 3), full_name: merchant?.full_name ?? null, phone: maskTail(merchant?.phone, 3), business_name: merchant?.business_name ?? null },
      stages: [
        { type: 'DOCUMENT', status: done('RUNNING'), title: 'Documento de identidad', label: 'DNI leído y validado por Didit' },
        { type: 'LIVENESS', status: done('RUNNING'), title: 'Prueba de vida y rostro', label: 'Selfie comparada con la foto del DNI' },
        { type: 'MATCH', status: done('PENDING'), title: 'Coincidencia con tus datos', label: 'El DNI del documento coincide con el que declaraste' }
      ],
      result: {
        status: fresh.status,
        approved_level: fresh.status === 'APPROVED' ? 1 : null,
        approved_limit_cents: fresh.status === 'APPROVED' ? 140000 : null,
        currency: 'PEN'
      }
    });
  }
  const isBusiness = publicId.startsWith('BIZ-') || !!merchant?.ruc;
  const business = merchant?.ruc ? await db.prepare('SELECT * FROM businesses WHERE ruc = ?').get(merchant.ruc) as any : null;

  const stages = isBusiness ? [
    {
      type: 'KYB_SUNAT',
      status: 'DONE',
      title: 'Verificación Empresarial KYB (SUNAT)',
      label: `Empresa formal activa — ${business?.razon_social || merchant?.business_name || 'Comercio Registrado'} (RUC: ${merchant?.ruc || '20601234567'})`
    },
    {
      type: 'KYC_RENIEC',
      status: 'DONE',
      title: 'Identidad del Representante Legal KYC (RENIEC)',
      label: `Representante acreditado — ${merchant?.full_name || 'CARLOS ALBERTO MENDOZA'} (DNI: ${merchant?.dni || '47891234'})`
    },
    {
      type: 'SCORING_B2B',
      status: 'DONE',
      title: 'Evaluación Crediticia B2B PyME',
      label: 'Línea de crédito comercial B2B aprobada para compras con proveedores'
    }
  ] : [
    {
      type: 'RENIEC',
      status: 'DONE',
      title: 'Identidad del Titular (RENIEC)',
      label: 'Identidad validada con Reniec — Ciudadano Hábil'
    },
    {
      type: 'ANTIFRAUD',
      status: 'DONE',
      title: 'Validación Celular y Antifraude',
      label: 'Verificación biométrica y titularidad de línea móvil'
    },
    {
      type: 'SCORING',
      status: 'DONE',
      title: 'Microcrédito Ágil Kuota',
      label: 'Evaluación crediticia ágil — Aprobado Nivel 1'
    }
  ];

  const approvedLimitCents = isBusiness ? 1500000 : 140000; // S/ 15,000 para Business vs S/ 1,400 para Personal

  // Modo demo: refleja el estado real de la solicitud (no se da por aprobada antes de validar).
  res.json({
    request_id: kyc.public_id,
    account_type: isBusiness ? 'BUSINESS' : 'PERSONAL',
    status: kyc.status,
    progress_pct: kyc.status === 'APPROVED' ? 100 : kyc.progress_pct,
    merchant: {
      dni: maskTail(merchant?.dni, 3),
      full_name: merchant?.full_name ?? null,
      phone: maskTail(merchant?.phone, 3),
      ruc: merchant?.ruc || (isBusiness ? '20601234567' : null),
      business_name: business?.razon_social || merchant?.business_name || 'Mi Negocio Kuota'
    },
    business: business || null,
    stages,
    result: {
      status: kyc.status,
      approved_limit_cents: approvedLimitCents,
      approved_level: isBusiness ? 4 : 1,
      currency: 'PEN',
      initial_rate_pct: 0
    }
  });
});

// Inicia la verificación de identidad real (Didit). En modo demo responde provider DEMO.
onboardingRouter.post('/merchant-kyc/:requestId/verification', async (req, res) => {
  try {
    const started = await startVerification(req.params.requestId);
    if (!started) return res.status(404).json({ error: { code: 'KYC_NOT_FOUND', message: 'Solicitud de verificación no encontrada.' } });
    if (started.provider === 'DEMO' && process.env.NODE_ENV === 'production') {
      return res.status(503).json({ error: { code: 'KYC_PROVIDER_REQUIRED', message: 'La verificación de identidad no está disponible.' } });
    }
    res.json(started);
  } catch (e) {
    if (e instanceof DiditError) {
      return res.status(502).json({ error: { code: 'KYC_PROVIDER_UNAVAILABLE', message: 'No pudimos iniciar la verificación. Inténtalo en unos minutos.' } });
    }
    throw e;
  }
});

// Modo demo (sin Didit, fuera de producción): simula la validación. Las imágenes
// se reciben solo para la demo y NO se guardan (Ley 29733).
onboardingRouter.post('/merchant-kyc/:requestId/documents', async (req, res) => {
  const publicId = req.params.requestId;
  const { dni_front, dni_back, selfie } = req.body || {};
  if (diditEnabled() || process.env.NODE_ENV === 'production') {
    return res.status(409).json({ error: { code: 'USE_IDENTITY_PROVIDER', message: 'Verifica tu identidad desde el enlace seguro de verificación.' } });
  }

  const kyc = await getKycByPublicId(publicId);
  if (kyc) {
    await db.prepare("UPDATE kyc_requests SET status = 'APPROVED', current_stage = 'SCORING', decision_status = 'DEMO', updated_at = utc_now_text() WHERE id = ?").run(kyc.id);
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
      reniec_status: 'VALIDADO_OFICIAL',
      biometric_match_score: 0.994,
      liveness_check: 'PASSED',
      antifraud_status: 'CLEAN'
    },
    result: {
      status: 'APPROVED',
      approved_limit_cents: 140000,
      approved_level: 1,
      currency: 'PEN'
    },
    message: 'Documentos DNI y biometría facial validados exitosamente.'
  });
});

// Obtener estado de la sesión
onboardingRouter.get('/sessions/:id', async (req, res) => {
  const session = await db.prepare('SELECT * FROM onboarding_sessions WHERE id = ?').get(req.params.id) as any;
  if (!session) {
    return res.status(404).json({ error: { code: 'SESSION_NOT_FOUND', message: 'Sesión no encontrada.' } });
  }

  const merchant = await db.prepare('SELECT * FROM merchant_profiles WHERE session_id = ?').get(session.id) as any;
  const products = await db.prepare('SELECT * FROM products WHERE session_id = ? AND deleted_at IS NULL').all(session.id);

  // Solo el id de sesión protege este GET: nunca devolver DNI, teléfono, PIN ni ids internos.
  res.json({
    session: {
      id: session.id,
      role: session.role,
      current_step: session.current_step,
      status: session.status,
      expires_at: session.expires_at
    },
    merchant_profile: merchant
      ? {
          id: merchant.id,
          business_name: merchant.business_name,
          ruc: merchant.ruc,
          category: merchant.category,
          seniority_range: merchant.seniority_range,
          tier_hint: merchant.tier_hint
        }
      : null,
    products
  });
});

// PRD 02: Emprendedor - Actividad comercial (Paso 1 de 3)
onboardingRouter.put('/sessions/:id/merchant-activity', async (req, res) => {
  const sessionId = req.params.id;
  const { category, seniority_range, business_name } = req.body;

  if (!category) {
    return res.status(422).json({ error: { code: 'CATEGORY_REQUIRED', message: 'Elige qué vendes para continuar.' } });
  }
  if (!seniority_range) {
    return res.status(422).json({ error: { code: 'SENIORITY_REQUIRED', message: 'Cuéntanos hace cuánto tienes tu negocio.' } });
  }

  const session = await ensureSession(sessionId, 'MERCHANT');

  const tierHint = seniority_range === 'CONSOLIDATED' ? 'EXTENDED_ELIGIBLE' : 'STANDARD';

  const existing = await db.prepare('SELECT id FROM merchant_profiles WHERE session_id = ?').get(sessionId) as any;
  if (existing) {
    await db.prepare(`
      UPDATE merchant_profiles
      SET category = ?, seniority_range = ?, tier_hint = ?, business_name = coalesce(?, business_name), updated_at = utc_now_text()
      WHERE session_id = ?
    `).run(category, seniority_range, tierHint, business_name, sessionId);
  } else {
    const profileId = 'mer_' + uuidv4().substring(0, 10);
    await db.prepare(`
      INSERT INTO merchant_profiles (id, session_id, category, seniority_range, tier_hint, business_name, payments_active)
      VALUES (?, ?, ?, ?, ?, ?, FALSE)
    `).run(profileId, sessionId, category, seniority_range, tierHint, business_name || 'Mi Negocio Kuota');
  }

  await db.prepare("UPDATE onboarding_sessions SET current_step = 'merchant_products' WHERE id = ?").run(sessionId);

  res.json({
    session_id: sessionId,
    next_step: 'merchant_products',
    progress: { current: 1, total: 3 },
    tier_hint: tierHint
  });
});

// PRD 03: Emprendedor - Añadir productos (Paso 2 de 3)
onboardingRouter.put('/sessions/:id/products', async (req, res) => {
  const sessionId = req.params.id;
  const { products } = req.body;

  if (!Array.isArray(products)) {
    return res.status(422).json({ error: { code: 'INVALID_PAYLOAD', message: 'La lista de productos es requerida.' } });
  }

  // Soft-delete previous products for this session
  await db.prepare("UPDATE products SET deleted_at = utc_now_text() WHERE session_id = ?").run(sessionId);

  const insertStmt = db.prepare(`
    INSERT INTO products (id, session_id, name, price_cents, is_frequent, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let validCount = 0;
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (p.name && p.name.trim() && p.price_cents > 0) {
      await insertStmt.run(
        p.id || 'prod_' + uuidv4().substring(0, 10),
        sessionId,
        p.name.trim(),
        Math.round(p.price_cents),
        p.is_frequent ? 1 : 0,
        i + 1
      );
      validCount++;
    }
  }

  await db.prepare("UPDATE onboarding_sessions SET current_step = 'merchant_ready' WHERE id = ?").run(sessionId);

  res.json({
    count: validCount,
    saved_at: new Date().toISOString(),
    progress: { current: 2, total: 3 }
  });
});

// PRD 04: Onboarding exitoso - Cierre y creación de línea
onboardingRouter.post('/sessions/:id/complete', async (req, res) => {
  const sessionId = req.params.id;
  const session = await ensureSession(sessionId, 'MERCHANT', true);

  let merchant = await db.prepare('SELECT * FROM merchant_profiles WHERE session_id = ?').get(sessionId) as any;
  if (!merchant) {
    // Sin datos de identidad no hay cuenta. Solo el simulador de escritorio (fuera de
    // producción) puede saltar directo aquí: se crea un perfil demo SIN verificar.
    if (process.env.NODE_ENV === 'production') {
      return res.status(409).json({ error: { code: 'IDENTITY_REQUIRED', message: 'Completa tus datos de identidad antes de terminar el registro.' } });
    }
    const merchantId = 'mer_' + uuidv4().substring(0, 10);
    await db.prepare(`
      INSERT INTO merchant_profiles (id, session_id, dni, full_name, phone, business_name, category, seniority_range, kyc_status)
      VALUES (?, ?, '47891234', 'CARLOS ALBERTO MENDOZA QUISPE', NULL, 'Bodega San Martín', 'FOOD', 'CONSOLIDATED', 'PENDING')
    `).run(merchantId, sessionId);
    merchant = await db.prepare('SELECT * FROM merchant_profiles WHERE id = ?').get(merchantId) as any;
  }

  // Idempotent: check if user already created for this session
  if (session.user_id) {
    const line = await db.prepare('SELECT * FROM credit_lines WHERE merchant_id = ?').get(merchant.id) as any;
    return res.json({
      user_id: session.user_id,
      merchant_id: merchant.id,
      credit_line_id: line?.id,
      access_token: 'jwt_mock_' + session.user_id,
      refresh_token: 'rt_mock_' + session.user_id,
      already_completed: true,
      welcome_summary: {
        business: {
          name: merchant.business_name || 'Mi Negocio Kuota',
          ruc: merchant.ruc || null,
          city: 'Lima',
          status: 'ACTIVE'
        },
        credit_line: {
          total_limit_cents: line?.total_limit_cents || 140000,
          level: line?.level || 1,
          level_name: 'Semilla',
          down_payment_pct: 50
        },
        next_level: {
          level: 2,
          limit_cents: 200000,
          hint: 'en 60 días con compras puntuales'
        }
      }
    });
  }

  const userId = 'usr_' + uuidv4().substring(0, 10);
  // El celular es el que el comercio registró en el paso de identidad.
  // Nunca el del body: si no, cualquiera registra (y bloquea) el número de otra persona.
  const declared = String(merchant.phone || (config.isProd ? '' : req.body.phone) || '').replace(/\D/g, '').slice(-9);
  const phone = declared.length === 9 ? `+51${declared}` : '+519' + Math.floor(10000000 + Math.random() * 90000000);
  if (await db.prepare('SELECT 1 FROM users WHERE phone = ?').get(phone)) {
    return res.status(409).json({
      error: { code: 'PHONE_ALREADY_REGISTERED', message: 'Este celular ya tiene una cuenta Kuota. Ingresa con tu PIN o usa otro número.' }
    });
  }

  // Atómico: users + merchant_profiles deben actualizarse juntos para que el
  // phone lookup de resolveClaimedMerchant encuentre el comercio en el login.
  const rucProvisional = `10${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;
  try {
  await db.tx(async () => {
    await db.prepare(`
      INSERT INTO users (id, phone, role, status, first_name, last_name, terms_accepted_at, privacy_accepted_at)
      VALUES (?, ?, 'MERCHANT', 'ACTIVE', ?, 'Comerciante', utc_now_text(), utc_now_text())
    `).run(userId, phone, req.body.first_name || String(merchant.full_name || 'Emprendedor').split(' ')[0]);

    await db.prepare(`
      UPDATE merchant_profiles
      SET user_id = ?, business_name = coalesce(?, business_name, 'Mi Negocio Kuota'), ruc = coalesce(?, ruc, ?)
      WHERE id = ?
    `).run(userId, req.body.business_name, req.body.ruc, rucProvisional, merchant.id);
  });
  } catch (e: any) {
    // Dos registros simultáneos con el mismo celular: el segundo choca con el índice único.
    if (e?.code === '23505') {
      return res.status(409).json({
        error: { code: 'PHONE_ALREADY_REGISTERED', message: 'Este celular ya tiene una cuenta Kuota. Ingresa con tu PIN o usa otro número.' }
      });
    }
    throw e;
  }

  // Link products to merchant_id
  await db.prepare('UPDATE products SET merchant_id = ? WHERE session_id = ?').run(merchant.id, sessionId);
  // Releer: el resumen debe mostrar el nombre y el RUC ya guardados.
  merchant = await db.prepare('SELECT * FROM merchant_profiles WHERE id = ?').get(merchant.id) as any;

  // Create Initial Credit Line: S/ 1,400.00 (140,000 cents), Nivel 1 Brote
  const lineId = 'line_' + uuidv4().substring(0, 10);
  await db.prepare(`
    INSERT INTO credit_lines (id, merchant_id, level, total_limit_cents, used_cents, consecutive_on_time, status)
    VALUES (?, ?, 1, 140000, 0, 0, 'ACTIVE')
  `).run(lineId, merchant.id);

  // Init Score Kuota: 720 points
  await db.prepare(`
    INSERT INTO credit_scores (merchant_id, score, level)
    VALUES (?, 720, 1)
  `).run(merchant.id);

  await db.prepare("UPDATE onboarding_sessions SET status = 'COMPLETED', user_id = ? WHERE id = ?").run(userId, sessionId);

  // Cuenta recién creada: el dispositivo que la registra queda vinculado y recibe su token de identidad.
  let identityToken: string | null = null;
  const regDevice = headerString(req, 'x-device-id');
  if (isValidDeviceId(regDevice)) {
    const dev = await linkDevice(merchant.id, regDevice, 'Dispositivo de registro', clientIp(req));
    if (!dev.revoked) identityToken = await issueIdentityToken(merchant.id, regDevice);
  }

  res.status(201).json({
    user_id: userId,
    merchant_id: merchant.id,
    identity_token: identityToken,
    credit_line_id: lineId,
    access_token: 'jwt_mock_' + userId,
    refresh_token: 'rt_mock_' + userId,
    welcome_summary: {
      business: {
        name: merchant.business_name || 'Mi Negocio Kuota',
        ruc: merchant.ruc || null,
        city: 'Lima',
        status: 'ACTIVE'
      },
      credit_line: {
        total_limit_cents: 140000,
        level: 1,
        level_name: 'Brote',
        down_payment_pct: 50
      },
      next_level: {
        level: 2,
        limit_cents: 350000,
        hint: 'en 60 días con 3 compras puntuales'
      }
    }
  });
});

// PRD Security: Crear y confirmar PIN de seguridad de 6 dígitos
onboardingRouter.post('/sessions/:id/security-pin', async (req, res) => {
  const sessionId = req.params.id;
  const { pin } = req.body ?? {};

  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
    return res.status(422).json({
      error: { code: 'INVALID_PIN', message: 'El PIN de seguridad debe contener exactamente 6 dígitos numéricos.' }
    });
  }
  const problem = pinProblem(pin);
  if (problem) {
    return res.status(422).json({ error: { code: 'WEAK_PIN', message: problem } });
  }

  // La app puede conocer solo su propio id de sesión (no el del servidor): si no existe, se crea ahora con
  // el rol que corresponde (proveedor si ya hay un perfil de proveedor con ese id de sesión).
  const providerOwner = (await db.prepare('SELECT id, pin_hash FROM provider_profiles WHERE session_id = ?').get(sessionId)) as { id: string; pin_hash: string | null } | undefined;
  const session = (await ensureSession(sessionId, providerOwner ? 'PROVIDER' : 'MERCHANT', true)) as any;
  // Con el id de sesión (que no es secreto) no se puede sobrescribir el PIN de una cuenta ya
  // protegida: para eso están /auth/pin/change y /auth/pin/recover.
  const owner = await db.prepare('SELECT id FROM merchant_profiles WHERE session_id = ?').get(sessionId) as { id: string } | undefined;
  if (owner && (await credentialFor(owner.id))) {
    return res.status(409).json({ error: { code: 'PIN_ALREADY_SET', message: 'Esta cuenta ya tiene un PIN. Usa "¿Olvidé mi PIN?" si no lo recuerdas.' } });
  }
  if (providerOwner?.pin_hash) {
    return res.status(409).json({ error: { code: 'PIN_ALREADY_SET', message: 'Esta cuenta ya tiene un PIN. Inicia sesión con tu PIN.' } });
  }
  // El PIN nunca se guarda en texto plano: scrypt con pimienta (ver security/crypto.ts).
  const pinHash = hashPin(pin);
  if (providerOwner) {
    // Credencial del proveedor: con ella inicia sesión después (teléfono + PIN).
    await db.prepare('UPDATE provider_profiles SET pin_hash = ?, pin_failed_attempts = 0, pin_locked_until = NULL WHERE id = ?').run(pinHash, providerOwner.id);
  }
  const merchant = await db.transaction(async () => {
    await db.prepare('UPDATE onboarding_sessions SET security_pin = ?, current_step = ? WHERE id = ?').run(pinHash, 'PIN_CONFIGURED', sessionId);
    if (session.user_id) {
      await db.prepare('UPDATE users SET security_pin = ? WHERE id = ?').run(pinHash, session.user_id);
    }
    return (await db.prepare('SELECT id FROM merchant_profiles WHERE session_id = ?').get(sessionId)) as { id: string } | undefined;
  })();
  // La credencial de cobro vive en la zona de dinero: la escribe ese módulo, con su usuario de base.
  if (merchant) await setMerchantPinHash(merchant.id, pinHash);

  // Primera vez que se fija el PIN de este comercio: el dispositivo queda vinculado y recibe su token de identidad.
  let identityToken: string | null = null;
  const deviceId = headerString(req, 'x-device-id');
  if (merchant && isValidDeviceId(deviceId)) {
    const dev = await linkDevice(merchant.id, deviceId, 'Dispositivo de registro', clientIp(req));
    if (!dev.revoked) identityToken = await issueIdentityToken(merchant.id, deviceId);
  }

  res.status(200).json({
    success: true,
    message: '¡PIN de seguridad de 6 dígitos activado con éxito!',
    pin_configured: true,
    identity_token: identityToken
  });
});
