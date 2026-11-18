// Endpoint Serverless Vercel: /api/chat
// Modelo de Inteligencia Artificial para el Asistente Técnico y Auditor de Backend de Kuota
// Integra Google Gemini API (Free Tier) con reglas estrictas de guardrails y conocimiento de arquitectura.

export const config = {
  maxDuration: 30,
};

const MAX_MSG_CHARS = 2000;

const SYSTEM_INSTRUCTION = `Eres el Arquitecto de Software y Auditor de Backend Oficial de Kuota (Monorepo Kuota Android / Backend).

REGLAS ESTRICTAS DE ALCANCE Y GOBERNANZA:
1. Tu alcance está ESTRICTAMENTE DELIMITADO a la arquitectura de software, seguridad, riel de pagos, liquidación interbancaria, base de datos y backend de Kuota.
2. Si el usuario te hace consultas ajenas, generales o no relacionadas con Kuota (chistes, recetas, otros lenguajes o proyectos externos, tareas, noticias, etc.), debes RECHAZAR amablemente pero con total firmeza la consulta, diciendo que tu rol está configurado exclusivamente para la infraestructura de Kuota, e invitándolo a consultar sobre el backend, seguridad o pagos.
3. Si el usuario saluda o muestra cortesía ("hola", "buenos días", "gracias"), responde con calidez humana, amabilidad y rigor técnico, presentándote como el Asistente Técnico y Auditor de Backend de Kuota y ofreciendo guiarlo en los módulos del backend y los 8 informes técnicos.
4. Base de Conocimiento Técnico Verificada en Código:
   - Comisión: 1.00% (100 bps) + IGV (18%) con redondeo Math.ceil.
   - Piso Mínimo Transaccional: S/ 4.50 sin IGV (S/ 5.31 con IGV), justificado por el costo unitario fijo de 360Pay de S/ 3.82 netos por transacción.
   - Sandbox de Simulación: POST /api/v1/dev/settle-pending requiere más de 5 minutos (300,000 ms) en estado PENDING. En producción responde estrictamente HTTP 403 Forbidden (SANDBOX_ONLY).
   - Estados de Liquidación (ST-01 a ST-07):
     * ST-01 (ACTIVE -> Link emitido): Pendiente de pago del cliente (vence en 48h; no suma a ventas recibidas).
     * ST-02 (PAID, settled_at IS NULL -> UI "Por confirmar"): Cliente ya pagó en 360Pay; fondos en custodia en tránsito interbancario a CCI (plazo estimado 48h, ¡NO es error!).
     * ST-03 (PAID, settled_at IS NOT NULL -> UI "Cancelado" / "Cobrado"): Liquidado al 100% en la cuenta CCI del proveedor (en el comercio peruano "Cancelado" = deuda pagada/saldada, ¡jamás anulada!).
     * ST-04 (EXPIRED -> UI "Vencido"), ST-05 (FAILED -> UI "Fallido"), ST-06 (CANCELLED -> UI "Anulado" antes del pago sin transferencia), ST-07 (AKUOTAS_PENDING -> UI "Por cobrar" crédito mayorista aKuotas!).
   - Unificación de Inicio y Conciliación: GET /api/v1/providers/orders es la Fuente Única de Verdad (Single Source of Truth) para ambos módulos.
   - Identidad, PIN y Sesiones (CTL-A01 a CTL-A07):
     * CTL-A01: PIN numérico de 6 dígitos con crypto.scryptSync (N=16384, r=8, p=1, keylen=32) sobre HMAC-SHA256(KUOTA_PIN_PEPPER, pin) y crypto.timingSafeEqual (crypto.ts:L44-L67).
     * CTL-A02: 5 intentos fallidos bloquean 15 min (pinLockMinutes: 15) + alerta antifraude de dispositivo no reconocido.
     * CTL-A03: Sesión mono-dispositivo vía revokeSessions() en merchant_sessions.
     * CTL-A04..A07: Token de sesión ks1.* firmado con HMAC-SHA256 (TTL 900s / 15 min por defecto vía KUOTA_SESSION_TTL_SEC), Refresh Token rotativo (TTL 90d con revocación de family_id ante reuso), Step-Up Token (TTL 120s / 2 min), Device Binding (16-64 chars) y enfriamiento de 24h en dispositivos nuevos (cooldownHours: 24).
   - Webhooks HMAC (CTL-B01 a CTL-B05): Firma sha256=\${hmac(secret, ts.rawBody)}, tolerancia anti-replay <= 300,000 ms (5 min), comparación segura crypto.timingSafeEqual, firma Didit KYC (X-Didit-Signature), firma interna de link y deduplicación en webhook_events.
   - Auditoría WORM (CTL-E01 a CTL-E04): Ledger de doble partida con balance neto 0, hash chaining SHA-256 + HMAC privado, redacción de secretos y anclaje periódico en audit_anchors.
   - Alcance del Portal: 27 Controles de Seguridad (Familias A, B, C, D, E), 14 Endpoints (/api/v1/...) y 8 Informes Técnicos.
5. Formato: Utiliza Markdown limpio, negritas en conceptos clave y bloques de código cortos cuando sea relevante.`;

function normalizeGeminiContents(messages, fallbackMessage) {
  const raw = [];
  if (Array.isArray(messages) && messages.length > 0) {
    for (const m of messages) {
      if (!m || typeof m.text !== 'string') continue;
      const cleanText = m.text.trim().slice(0, MAX_MSG_CHARS);
      if (!cleanText) continue;
      const role = m.sender === 'user' ? 'user' : 'model';
      raw.push({ role, text: cleanText });
    }
  } else if (typeof fallbackMessage === 'string' && fallbackMessage.trim()) {
    raw.push({ role: 'user', text: fallbackMessage.trim().slice(0, MAX_MSG_CHARS) });
  }

  // Eliminar turnos 'model' iniciales (ej. mensaje de bienvenida estático del chat)
  while (raw.length > 0 && raw[0].role === 'model') {
    raw.shift();
  }

  // Fusionar turnos consecutivos con el mismo role para cumplir el contrato estricto de Gemini
  const contents = [];
  for (const item of raw) {
    const last = contents[contents.length - 1];
    if (last && last.role === item.role) {
      last.parts[0].text += `\n\n${item.text}`;
    } else {
      contents.push({
        role: item.role,
        parts: [{ text: item.text }]
      });
    }
  }

  if (contents.length === 0 && typeof fallbackMessage === 'string' && fallbackMessage.trim()) {
    contents.push({
      role: 'user',
      parts: [{ text: fallbackMessage.trim().slice(0, MAX_MSG_CHARS) }]
    });
  }

  return contents;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, messages, apiKey: clientApiKey } = req.body || {};
    const apiKey = clientApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!apiKey) {
      return res.status(200).json({
        fallback: true,
        message: 'No hay GEMINI_API_KEY en el servidor. Utilizando motor experto local de Kuota con guardrails integrados.'
      });
    }

    const contents = normalizeGeminiContents(messages, message);
    if (contents.length === 0) {
      return res.status(400).json({ error: 'Mensaje vacío o inválido' });
    }

    const payload = {
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }]
      },
      contents,
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 1024,
        topP: 0.95
      }
    };

    // Modelos ultra-rápidos de Google Gemini oficiales (3.5-flash-lite responde en ~2-3s en Vercel Serverless)
    const modelsToTry = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidate) {
            return res.status(200).json({
              success: true,
              model: modelName,
              autonomous: true,
              reply: candidate
            });
          }
        } else {
          lastError = await response.text();
        }
      } catch (err) {
        lastError = err.message;
      }
    }

    console.warn('Gemini models attempted, falling back to local engine:', lastError);
    return res.status(200).json({
      fallback: true,
      error: lastError,
      message: 'Respuesta servida por el motor local de contingencia.'
    });
  } catch (err) {
    console.error('Error in /api/chat:', err);
    return res.status(200).json({
      fallback: true,
      error: err.message
    });
  }
}
