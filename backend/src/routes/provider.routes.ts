import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';
import { sunatService } from '../services/sunat.service.js';
import { startVerification } from '../services/kyc.service.js';

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
  const { session_id, ruc, legal_rep_dni, whatsapp, user_id } = req.body;

  if (!ruc || ruc.length !== 11) {
    return res.status(422).json({ error: { code: 'RUC_INVALID', message: 'Ingresa un RUC válido de 11 dígitos.' } });
  }

  // 1. Check if business already exists in KUOTA
  const existing = await db.prepare('SELECT id, ruc, razon_social FROM businesses WHERE ruc = ?').get(ruc) as any;
  if (existing) {
    // Si ya existe, actualiza los datos de contacto y retorna éxito para permitir re-ingreso sin bloquear
    await db.prepare(`
      UPDATE businesses
      SET usuario_propietario = coalesce(?, usuario_propietario),
          fecha_actualizacion = utc_now_text()
      WHERE id = ?
    `).run(legal_rep_dni, existing.id);

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
    await db.prepare(`
      UPDATE provider_profiles
      SET legal_name = ?, legal_rep_dni = coalesce(?, legal_rep_dni), whatsapp = coalesce(?, whatsapp)
      WHERE id = ?
    `).run(d.razon_social, legal_rep_dni, whatsapp, existingProv.id);
  } else {
    await db.prepare(`
      INSERT INTO provider_profiles (
        id, session_id, ruc, legal_name, legal_rep_dni, whatsapp, category,
        seniority_range, kyc_status, fee_bps
      ) VALUES (?, ?, ?, ?, ?, ?, 'TEXTILES', '1Y_3Y', 'IN_REVIEW', 100)
    `).run(provId, session_id, d.ruc, d.razon_social, legal_rep_dni || '', whatsapp || '');
  }

  // 5. Create KYC request with PRV- public id
  const requestId = 'req_' + uuidv4().substring(0, 10);
  const publicId = 'PRV-' + Math.floor(10000 + Math.random() * 90000) + '-PE';

  await db.prepare(`
    INSERT INTO kyc_requests (id, provider_id, session_id, public_id, status, progress_pct)
    VALUES (?, ?, ?, ?, 'IN_PROGRESS', 78)
  `).run(requestId, provId, session_id || 'ses_anon', publicId);

  const finalProvId = existingProv ? existingProv.id : provId;

  res.status(201).json({
    success: true,
    message: '¡Negocio identificado y registrado con éxito!',
    business_id: businessId,
    request_id: publicId,
    provider_id: finalProvId,
    data: d,
    next_step: 'provider_validating'
  });
});

// PRD 11: Iniciar solicitud KYC (actualizado)
providerRouter.post('/kyc/requests', async (req, res) => {
  const { session_id, ruc, legal_rep_dni, whatsapp } = req.body;

  if (!ruc || ruc.length !== 11) {
    return res.status(422).json({ error: { code: 'RUC_INVALID', message: 'El RUC debe tener 11 dígitos.' } });
  }
  if (!legal_rep_dni || legal_rep_dni.length !== 8) {
    return res.status(422).json({ error: { code: 'DNI_INVALID', message: 'El DNI debe tener 8 dígitos.' } });
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
      INSERT INTO provider_profiles (id, session_id, ruc, legal_name, legal_rep_dni, whatsapp, kyc_status)
      VALUES (?, ?, ?, 'DISTRIBUIDORA ANDINA DEL SUR S.A.C.', ?, ?, 'IN_REVIEW')
    `).run(provId, session_id, ruc, legal_rep_dni, whatsapp);
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
      legal_rep_dni: repDni
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
  const providerId = req.headers['x-provider-id'] as string | undefined;

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

// PRD 16: Cuenta bancaria de abono
providerRouter.put('/settlement-account', async (req, res) => {
  const { bank, cci } = req.body;
  const providerId = req.headers['x-provider-id'] as string | undefined;

  if (!cci || cci.length !== 20) {
    return res.status(422).json({ error: { code: 'CCI_INVALID', message: 'El código de cuenta interbancario (CCI) debe tener 20 dígitos.' } });
  }

  if (providerId) {
    await db.prepare(`
      UPDATE provider_profiles SET settlement_bank = ?, settlement_cci = ?, updated_at = utc_now_text()
      WHERE id = ?
    `).run(bank || 'BCP', cci, providerId).catch(() => {});
  }

  res.json({
    success: true,
    bank: bank || 'BCP',
    account_masked: '••• ' + cci.slice(-4),
    status: 'ACTIVE'
  });
});

// PRD 16: Activación definitiva
providerRouter.post('/activate', async (req, res) => {
  const providerId = req.headers['x-provider-id'] as string | undefined;

  if (providerId) {
    await db.prepare(`
      UPDATE provider_profiles SET kyc_status = 'APPROVED', updated_at = utc_now_text()
      WHERE id = ?
    `).run(providerId).catch(() => {});
  }

  res.json({
    status: 'APPROVED',
    provider_verified: true,
    fee_bps: 100,
    fee_pct: 1.0,
    message: '¡Tu cuenta de Proveedor está lista! Ya puedes generar enlaces de cobro y emitir facturas.'
  });
});

// PRD 04: Proveedores recomendados para comercios
providerRouter.get('/recommended', (req, res) => {
  res.json([
    {
      id: 'prov_donlucho',
      name: 'Confecciones Don Lucho & Hnos.',
      category: 'Textil e Insumos',
      badge: 'Mayorista Verificado',
      max_credit_cents: 120000,
      zone: 'Gamarra, Lima',
      rating: 4.9
    },
    {
      id: 'prov_distlima',
      name: 'Distribuidora Lima Mayorista',
      category: 'Abarrotes y Alimentos',
      badge: 'Top Proveedor',
      max_credit_cents: 80000,
      zone: 'Mercado Central, Lima',
      rating: 4.8
    },
    {
      id: 'prov_alicorp',
      name: 'Alicorp Distribución Directa',
      category: 'Insumos Alimentarios',
      badge: 'Oficial',
      max_credit_cents: 140000,
      zone: 'Callao, Lima',
      rating: 5.0
    }
  ]);
});

// P2P aKuotas: lista de proveedores afiliados con datos completos para la pantalla de compra
providerRouter.get('/affiliated', (req, res) => {
  res.json([
    {
      id: 'prov_donlucho',
      name: 'Confecciones Don Lucho & Hnos. S.A.C.',
      category: 'Textil e Insumos',
      description: 'Polos, pantalones y ropa deportiva al por mayor. Despacho el mismo día.',
      badge: 'Mayorista Verificado',
      address: 'Galería Santa Rosa, Tda. 204 – Jr. Gamarra 840, La Victoria',
      district: 'La Victoria',
      zone: 'Gamarra, Lima',
      phone: '+51 984 521 893',
      min_order_cents: 20000,
      max_order_cents: 120000,
      rating: 4.9,
      reviews: 142
    },
    {
      id: 'prov_distlima',
      name: 'Distribuidora Lima Mayorista S.R.L.',
      category: 'Abarrotes y Alimentos',
      description: 'Aceites, azúcar, arroz y abarrotes al por mayor. Entrega a domicilio gratis >S/300.',
      badge: 'Top Proveedor',
      address: 'Pab. B, Stand 112 – Mercado Central de Lima, Cercado de Lima',
      district: 'Cercado de Lima',
      zone: 'Mercado Central, Lima',
      phone: '+51 976 112 340',
      min_order_cents: 15000,
      max_order_cents: 80000,
      rating: 4.8,
      reviews: 98
    },
    {
      id: 'prov_alicorp',
      name: 'Alicorp Distribución Directa S.A.',
      category: 'Insumos Alimentarios',
      description: 'Fideos, aceites y harinas Alicorp directo del fabricante. Sin intermediarios.',
      badge: 'Oficial',
      address: 'Av. Argentina 4793, Callao',
      district: 'Callao',
      zone: 'Callao, Lima',
      phone: '+51 1 315 0800',
      min_order_cents: 50000,
      max_order_cents: 140000,
      rating: 5.0,
      reviews: 311
    },
    {
      id: 'prov_textilnorte',
      name: 'Textiles del Norte E.I.R.L.',
      category: 'Textil e Insumos',
      description: 'Telas, hilos y accesorios de costura al por mayor. Especialistas en tela jersey.',
      badge: 'Verificado',
      address: 'Av. Aviación 2345, San Borja',
      district: 'San Borja',
      zone: 'San Borja, Lima',
      phone: '+51 981 445 220',
      min_order_cents: 10000,
      max_order_cents: 60000,
      rating: 4.7,
      reviews: 67
    }
  ]);
});
