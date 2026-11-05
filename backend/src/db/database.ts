// Inicialización de la base: conexión (PGlite en desarrollo, Postgres en
// producción), migraciones versionadas y datos semilla.
import { closeDatabases, connectDatabases, db, paymentsDb } from './client.js';
import { migrate } from './migrate.js';
import { seedData, seedSunatData } from './seed.js';
import { seedSecurity } from '../security/schema.js';

export { db, paymentsDb, closeDatabases };

export async function initDatabase() {
  await connectDatabases();
  // En producción las migraciones corren como paso del despliegue (npm run migrate) con
  // el usuario dueño del esquema; la app arranca con KUOTA_AUTO_MIGRATE=0.
  if (process.env.KUOTA_AUTO_MIGRATE !== '0') await migrate(db, (m) => console.log(m));
  await seedData();
  if (process.env.NODE_ENV !== 'production') await seedSunatData();
  await seedSecurity();
}
