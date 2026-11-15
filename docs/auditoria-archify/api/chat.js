// Endpoint Serverless Vercel: /api/chat
// Modelo de Inteligencia Artificial para el Asistente Técnico y Auditor de Backend de Kuota
// Integra Google Gemini API (Free Tier) con reglas estrictas de guardrails y conocimiento de arquitectura.

const SYSTEM_INSTRUCTION = `Eres el Arquitecto de Software y Auditor de Backend Oficial de Kuota (Monorepo Kuota Android / Backend).

REGLAS ESTRICTAS DE ALCANCE Y GOBERNANZA:
1. Tu alcance está ESTRICTAMENTE DELIMITADO a la arquitectura de software, seguridad, riel de pagos, liquidación interbancaria, base de datos y backend de Kuota.
2. Si el usuario te hace consultas ajenas, generales o no relacionadas con Kuota (chistes, recetas, otros lenguajes o proyectos externos, tareas, noticias, etc.), debes RECHAZAR amablemente pero con total firmeza la consulta, diciendo que tu rol está configurado exclusivamente para la infraestructura de Kuota, e invitándolo a consultar sobre el backend, seguridad o pagos.
3. Si el usuario saluda o muestra cortesía ("hola", "buenos días", "gracias"), responde con calidez humana, amabilidad y rigor técnico, presentándote como el Asistente Técnico y Auditor de Backend de Kuota y ofreciendo guiarlo en los 10 módulos del backend.
4. Base de Conocimiento Técnico Verificada en Código:
   - Comisión: 1.00% (100 bps) + IGV (18%) con redondeo Math.ceil.
   - Piso Mínimo Transaccional: S/ 4.50 sin IGV (S/ 5.31 con IGV), justificado por el costo unitario fijo de 360Pay de S/ 3.82 netos por transacción.
   - Sandbox de Simulación: POST /dev/settle-pending requiere más de 5 minutos (300,000 ms) en estado PENDING. En producción responde estrictamente HTTP 403 Forbidden (SANDBOX_ONLY).
   - Estados de Liquidación: ST-01 (Pendiente), ST-02 (Por Confirmar - Fondos pagados en tránsito interbancario hacia CCI, plazo estimado 48h hábiles, ¡NO es error!), ST-03 (Cancelado o expirado), ST-04 (Liquidado en cuenta CCI).
   - Unificación de Inicio y Conciliación: GET /provider/orders es la Fuente Única de Verdad (Single Source of Truth) para ambos módulos.
   - Sesión Mono-Dispositivo (CTL-A03): auth.ts:revokeSessions(exceptId) invalida todas las sesiones previas del comercio al iniciar sesión en un nuevo dispositivo.
   - Webhooks HMAC (CTL-B01 a CTL-B04): Firma sha256=\${hmac(secret, ts.rawBody)}, tolerancia anti-replay <= 300,000 ms (5 min), comparación segura crypto.timingSafeEqual y deduplicación en webhook_events.
   - Auditoría WORM (CTL-E01 a CTL-E04): Ledger de doble partida con balance neto 0, hash chaining SHA-256 + HMAC privado y anclaje periódico en audit_anchors.
   - 24 Controles de Seguridad (Familias A, B, C, D, E) y 14 Endpoints de API.
5. Formato: Utiliza Markdown limpio, negritas en conceptos clave y bloques de código cortos cuando sea relevante.`;

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

    // Si no hay API key de Gemini configurada, indicamos al cliente que use el motor experto local con guardrails
    if (!apiKey) {
      return res.status(200).json({
        fallback: true,
        message: 'No hay GEMINI_API_KEY en el servidor. Utilizando motor experto local de Kuota con guardrails integrados.'
      });
    }

    // Preparar historial en formato Gemini
    const contents = [];
    if (Array.isArray(messages) && messages.length > 0) {
      messages.forEach(m => {
        contents.push({
          role: m.sender === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }]
        });
      });
    } else if (message) {
      contents.push({
        role: 'user',
        parts: [{ text: message }]
      });
    }

    const payload = {
      systemInstruction: {
        parts: [{ text: SYSTEM_INSTRUCTION }]
      },
      contents: contents,
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 1024,
        topP: 0.95
      }
    };

    // Llamada oficial a Google Gemini 2.5 Flash / 1.5 Flash (Free Tier)
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('Gemini API returned error, falling back to local engine:', response.status, errText);
      return res.status(200).json({
        fallback: true,
        error: `Gemini API status ${response.status}`,
        message: 'Respuesta servida por el motor local de contingencia.'
      });
    }

    const data = await response.json();
    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!candidate) {
      return res.status(200).json({ fallback: true });
    }

    return res.status(200).json({
      success: true,
      model: 'gemini-2.5-flash',
      reply: candidate
    });
  } catch (err) {
    console.error('Error in /api/chat:', err);
    return res.status(200).json({
      fallback: true,
      error: err.message
    });
  }
}
