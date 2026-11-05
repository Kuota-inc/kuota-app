// Migraciones versionadas: backend/migrations/NNNN_nombre.sql, en orden.
// Cada una corre en su transacción y queda en public.schema_migrations con su
// checksum; editar una migración ya aplicada es un error (se crea otra nueva).
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Db } from './client.js';

const MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations/', import.meta.url));

export async function migrate(target: Db, log: (msg: string) => void = () => {}) {
  await target.exec(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      version TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(MIGRATIONS_DIR + file, 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    await target.tx(async () => {
      await target.lock('kuota:migrations'); // dos réplicas arrancando a la vez no migran dos veces
      const done = await target.get<{ checksum: string }>('SELECT checksum FROM public.schema_migrations WHERE version = ?', file);
      if (done) {
        if (done.checksum !== checksum) throw new Error(`La migración ${file} cambió después de aplicarse; crea una migración nueva.`);
        return;
      }
      await target.exec(sql);
      await target.run('INSERT INTO public.schema_migrations (version, checksum, applied_at) VALUES (?, ?, ?)', file, checksum, new Date().toISOString());
      log(`migración aplicada: ${file}`);
    });
  }
}
