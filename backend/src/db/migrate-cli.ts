// Aplica las migraciones pendientes y termina. En producción corre como paso del
// despliegue (Cloud Run job) con el usuario dueño del esquema (DATABASE_URL).
//   npm run migrate            (desarrollo: PGlite en .pgdata)
//   node dist/db/migrate-cli.js (contenedor)
import 'dotenv/config';
import { closeDatabases, connectDatabases, db } from './client.js';
import { migrate } from './migrate.js';

await connectDatabases();
try {
  await migrate(db, (m) => console.log(m));
  console.log(`migraciones al día (${db.kind})`);
} finally {
  await closeDatabases();
}
