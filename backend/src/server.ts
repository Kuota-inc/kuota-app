import 'dotenv/config';
import { createApp } from './app.js';
import { verifyAuditChain } from './security/audit.js';

const PORT = Number(process.env.PORT) || 3001;

(await createApp()).listen(PORT, () => {
  console.log(`🚀 Kuota Backend API running on http://localhost:${PORT}/api/v1`);
});

// Vigilancia de la bitácora inmutable: si la cadena de hashes se rompe, alguien tocó la base.
async function watchAuditChain() {
  try {
    const r = await verifyAuditChain();
    if (!r.ok) console.error('[ALERTA-SEGURIDAD] La cadena de la bitácora está rota', JSON.stringify(r));
  } catch (e) {
    console.error('[audit-watch]', e instanceof Error ? e.message : e);
  }
}
setTimeout(watchAuditChain, 30_000).unref();
setInterval(watchAuditChain, 60 * 60_000).unref();
