import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database.js';

export const paymentLinkRouter = Router();

function getMerchantProfile(req: any) {
  const merchantId = req.headers['x-merchant-id'] as string;
  if (merchantId) {
    const m = db.prepare('SELECT * FROM merchant_profiles WHERE id = ?').get(merchantId);
    if (m) return m as any;
  }
  let profile = db.prepare("SELECT * FROM merchant_profiles WHERE id = 'mer_carlos'").get() as any;
  if (!profile) {
    profile = db.prepare("SELECT * FROM merchant_profiles LIMIT 1").get() as any;
  }
  if (!profile) {
    const newId = 'mer_carlos';
    db.prepare(`
      INSERT INTO merchant_profiles (id, dni, full_name, phone, business_name, category, seniority_range, kyc_status)
      VALUES (?, '47891234', 'CARLOS ALBERTO MENDOZA QUISPE', '987654321', 'Bodega San Martín', 'FOOD', 'CONSOLIDATED', 'APPROVED')
    `).run(newId);
    profile = db.prepare("SELECT * FROM merchant_profiles WHERE id = 'mer_carlos'").get() as any;
  }
  return profile;
}

// PRD 08: Cotización de cobro
paymentLinkRouter.post('/quote', (req, res) => {
  const { amount_cents } = req.body;
  if (!amount_cents || amount_cents <= 0) {
    return res.status(422).json({ error: { code: 'AMOUNT_INVALID', message: 'Ingresa un monto mayor a S/ 0.' } });
  }

  // 1% fee, rounded UP to nearest cent
  const feeCents = Math.ceil((amount_cents * 100) / 10000); // 100 bps = 1.00%
  const netCents = amount_cents - feeCents;

  // Reputación: 1 punto por cada S/ 10 cobrados
  const estimatedPoints = Math.max(1, Math.floor(amount_cents / 1000));

  res.json({
    amount_cents,
    fee_cents: feeCents,
    fee_pct: 1.0,
    net_cents: netCents,
    estimated_points: estimatedPoints
  });
});

// PRD 08: Crear borrador de link de pago
paymentLinkRouter.post('/', (req, res) => {
  const merchant = getMerchantProfile(req);
  const { amount_cents, concept, product_id, quantity } = req.body;

  if (!amount_cents || amount_cents <= 0) {
    return res.status(422).json({ error: { code: 'AMOUNT_INVALID', message: 'Ingresa un monto mayor a S/ 0.' } });
  }

  const feeCents = Math.ceil((amount_cents * 100) / 10000);
  const netCents = amount_cents - feeCents;
  const linkId = 'lnk_' + uuidv4().substring(0, 10);
  const token = uuidv4().replace(/-/g, '').substring(0, 24);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO payment_links (id, merchant_id, token, amount_cents, fee_cents, net_cents, fee_bps, concept, product_id, quantity, status, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, 100, ?, ?, ?, 'DRAFT', ?)
  `).run(linkId, merchant.id, token, amount_cents, feeCents, netCents, concept || 'Cobro Kuota', product_id, quantity || 1, expiresAt);

  res.status(201).json({
    id: linkId,
    token,
    amount_cents,
    fee_cents: feeCents,
    net_cents: netCents,
    status: 'DRAFT',
    expires_at: expiresAt
  });
});

// PRD 08: Completar datos del cliente
paymentLinkRouter.patch('/:id/customer', (req, res) => {
  const linkId = req.params.id;
  const { customer_name, customer_phone, customer_email } = req.body;

  db.prepare(`
    UPDATE payment_links
    SET customer_name = ?, customer_phone = ?, customer_email = ?
    WHERE id = ?
  `).run(customer_name, customer_phone, customer_email, linkId);

  res.json({ success: true, id: linkId });
});

// PRD 08: Emitir / Activar link
paymentLinkRouter.post('/:id/issue', (req, res) => {
  const linkId = req.params.id;
  const link = db.prepare('SELECT * FROM payment_links WHERE id = ?').get(linkId) as any;

  if (!link) {
    return res.status(404).json({ error: { code: 'LINK_NOT_FOUND', message: 'Link no encontrado.' } });
  }

  db.prepare("UPDATE payment_links SET status = 'ACTIVE' WHERE id = ?").run(linkId);

  const publicUrl = `http://localhost:5173/pay/${link.token}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(publicUrl)}`;

  res.json({
    id: linkId,
    token: link.token,
    url: publicUrl,
    qr_url: qrUrl,
    expires_at: link.expires_at,
    status: 'ACTIVE'
  });
});

// Consultar link público (para la pantalla de pago del cliente)
paymentLinkRouter.get('/public/:token', (req, res) => {
  const link = db.prepare(`
    SELECT l.*, m.business_name, m.city
    FROM payment_links l
    JOIN merchant_profiles m ON l.merchant_id = m.id
    WHERE l.token = ?
  `).get(req.params.token) as any;

  if (!link) {
    return res.status(404).json({ error: { code: 'LINK_NOT_FOUND', message: 'Este link de pago no existe o caducó.' } });
  }
  if (link.status === 'PAID') {
    return res.status(409).json({ error: { code: 'LINK_ALREADY_PAID', message: 'Este cobro ya fue pagado.' } });
  }

  res.json({
    token: link.token,
    merchant_name: link.business_name,
    concept: link.concept,
    amount_cents: link.amount_cents,
    status: link.status,
    expires_at: link.expires_at
  });
});

// Simulación de Webhook de Pasarela de Pagos (Yape / Plin / Tarjeta)
paymentLinkRouter.post('/webhook', (req, res) => {
  const { token, method = 'YAPE' } = req.body;
  const link = db.prepare('SELECT * FROM payment_links WHERE token = ?').get(token) as any;

  if (!link) {
    return res.status(404).json({ error: { code: 'LINK_NOT_FOUND', message: 'Link no encontrado.' } });
  }
  if (link.status === 'PAID') {
    return res.json({ message: 'Ya registrado como pagado.' });
  }

  const paymentId = 'pay_' + uuidv4().substring(0, 10);
  const gatewayRef = 'GW-' + Math.floor(10000000 + Math.random() * 90000000);

  // 1. Mark link as PAID
  db.prepare(`
    UPDATE payment_links SET status = 'PAID', paid_at = datetime('now'), gateway_ref = ? WHERE id = ?
  `).run(gatewayRef, link.id);

  // 2. Record payment
  db.prepare(`
    INSERT INTO payments (id, payment_link_id, method, gateway_ref, amount_cents, status)
    VALUES (?, ?, ?, ?, ?, 'SUCCESS')
  `).run(paymentId, link.id, method, gatewayRef, link.amount_cents);

  // 3. Double-entry ledger entries
  const insertLedger = db.prepare(`
    INSERT INTO ledger_entries (id, payment_id, account, type, amount_cents, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  // Cash Inflow: +amount_cents
  insertLedger.run('led_' + uuidv4().substring(0, 8), paymentId, 'GATEWAY_CLEARING', 'DEBIT', link.amount_cents, 'Cobro ingresado');
  // Merchant Payable: -net_cents
  insertLedger.run('led_' + uuidv4().substring(0, 8), paymentId, 'MERCHANT_WALLET', 'CREDIT', link.net_cents, 'Abono neto a comercio');
  // Kuota Revenue (1% Fee): -fee_cents
  insertLedger.run('led_' + uuidv4().substring(0, 8), paymentId, 'KUOTA_FEE_REVENUE', 'CREDIT', link.fee_cents, 'Comisión 1%');

  // 4. Record as verified sale in merchant sales
  const saleId = 'sale_' + uuidv4().substring(0, 10);
  db.prepare(`
    INSERT INTO sales (id, merchant_id, source, amount_cents, concept, operation_ref, verified, occurred_at)
    VALUES (?, ?, 'PAYMENT_LINK', ?, ?, ?, 1, datetime('now'))
  `).run(saleId, link.merchant_id, link.amount_cents, link.concept, gatewayRef);

  // 5. Emit score points
  const points = Math.max(5, Math.floor(link.amount_cents / 1000));
  db.prepare(`
    INSERT INTO score_events (id, merchant_id, type, points, ref_id)
    VALUES (?, ?, 'VERIFIED_SALE', ?, ?)
  `).run('sev_' + uuidv4().substring(0, 10), link.merchant_id, points, saleId);

  db.prepare('UPDATE credit_scores SET score = min(850, score + ?) WHERE merchant_id = ?').run(points, link.merchant_id);

  res.json({
    success: true,
    payment_id: paymentId,
    status: 'PAID',
    net_credited_cents: link.net_cents,
    fee_charged_cents: link.fee_cents,
    points_awarded: points
  });
});
