import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.resolve(__dirname, '../../kuota.db');
const db = new Database(dbPath);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const rucs = [
  '20100070970', // Supermercados Peruanos S.A.
  '20100128056', // Falabella
  '20331898008', // Ripley
  '20255993225', // Cencosud
  '20100017491', // Telefonica
  '20467534026', // Claro
  '20543166649', // Entel
  '20100053455', // BBVA
  '20100030595', // Interbank
  '20505872071', // Arca Continental Lindley
  '20514197325', // Tottus
  '20380310749', // Farmacias Peruanas (Inkafarma)
  '20297868790', // Sodimac
  '20383796596', // Promart
  '20503063133', // Latam Airlines
  '10750690713'  // Persona natural con negocio
];

async function seedReal() {
  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO sunat_contribuyentes (
      ruc, nombre_razon_social, nombre_comercial, tipo_contribuyente,
      actividad_principal, actividades_secundarias, estado_contribuyente,
      condicion_domicilio, ubigeo, direccion_fiscal, departamento,
      provincia, distrito, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);

  console.log(`Starting real RUC fetch for ${rucs.length} companies...`);

  for (const ruc of rucs) {
    const existing = db.prepare('SELECT ruc, nombre_razon_social FROM sunat_contribuyentes WHERE ruc = ?').get(ruc) as any;
    if (existing && !existing.nombre_razon_social.startsWith('COMERCIALIZADORA')) {
      console.log(`✓ Already in DB: ${ruc} - ${existing.nombre_razon_social}`);
      continue;
    }

    try {
      console.log(`Fetching live data for RUC ${ruc}...`);
      const res = await fetch(`https://api.apis.net.pe/v1/ruc?numero=${ruc}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Referer': 'https://apis.net.pe/consulta-ruc-api'
        }
      });

      if (res.status === 200) {
        const d: any = await res.json();
        const isPersona = ruc.startsWith('10');
        const tipoContribuyente = isPersona ? 'PERSONA NATURAL CON NEGOCIO' : 'SOCIEDAD ANONIMA';
        const direccion = [d.direccion, d.distrito, d.provincia].filter(Boolean).join(', ') || 'Dirección fiscal registrada';

        insertStmt.run(
          d.numeroDocumento || ruc,
          d.nombre || 'EMPRESA PERUANA',
          d.nombre || '-',
          tipoContribuyente,
          'Actividad económica declarada en SUNAT',
          'Comercio y distribución',
          d.estado || 'ACTIVO',
          d.condicion || 'HABIDO',
          d.ubigeo || '150101',
          direccion,
          d.departamento || 'LIMA',
          d.provincia || 'LIMA',
          d.distrito || 'LIMA'
        );
        console.log(`  ✓ SAVED: [${ruc}] ${d.nombre} (${d.estado}/${d.condicion}) - ${d.distrito}`);
      } else {
        console.log(`  ⚠ Response status: ${res.status} for ${ruc}`);
      }
    } catch (e: any) {
      console.error(`  ✗ Error for ${ruc}:`, e.message);
    }
    // Respect polite rate limit
    await sleep(2200);
  }

  const total = db.prepare('SELECT count(*) as count FROM sunat_contribuyentes').get() as any;
  console.log(`Finished. Total in sunat_contribuyentes: ${total.count}`);
}

seedReal();
