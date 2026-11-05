// Base de datos para cada archivo de pruebas.
// - Sin DATABASE_URL: PGlite en memoria (rápido, sin servicios).
// - Con DATABASE_URL (CI o Postgres local): crea una base nueva y la borra al final,
//   así cada archivo corre sobre una base limpia de un Postgres real.
export async function useTestDatabase(): Promise<() => Promise<void>> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.env.KUOTA_PG_DATA = ':memory:';
    return async () => {};
  }
  const { default: pg } = await import('pg');
  const name = `kuota_test_${process.pid}_${Date.now()}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  // CREATE DATABASE copia template1: dos archivos creando a la vez pueden chocar; se reintenta.
  for (let attempt = 1; ; attempt++) {
    try {
      await admin.query(`CREATE DATABASE ${name}`);
      break;
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
  await admin.end();
  const target = new URL(url);
  target.pathname = `/${name}`;
  process.env.DATABASE_URL = target.toString();
  delete process.env.PAYMENTS_DATABASE_URL;
  return async () => {
    const cleanup = new pg.Client({ connectionString: url });
    await cleanup.connect();
    await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await cleanup.end();
  };
}
