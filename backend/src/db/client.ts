// Acceso a Postgres para todo el backend.
//
// - Producción / staging: DATABASE_URL (pool `pg`, p. ej. Cloud SQL). El módulo de
//   pagos usa su propio usuario con privilegio mínimo: PAYMENTS_DATABASE_URL.
// - Desarrollo y pruebas: PGlite (Postgres real compilado a WASM, dentro del
//   proceso). KUOTA_PG_DATA es su carpeta; ':memory:' para una base efímera.
//
// La API imita a la anterior (prepare().get/all/run y transaction()) pero es
// asíncrona. Las transacciones se propagan por AsyncLocalStorage: dentro de
// `db.tx(fn)` toda consulta usa la misma conexión sin pasarla a mano.
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';

export interface Executor {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[]; affectedRows?: number; rowCount?: number | null }>;
  exec(sql: string): Promise<void>;
}

interface Driver extends Executor {
  readonly kind: 'pglite' | 'pg';
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Postgres devuelve bigint y numeric como texto: aquí se leen como número. */
const INT8 = 20;
const NUMERIC = 1700;
const SEARCH_PATH = 'payments, public';

async function pgliteDriver(dataDir: string | undefined): Promise<Driver> {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(dataDir, {
    parsers: { [INT8]: (v: string) => Number(v), [NUMERIC]: (v: string) => Number(v) }
  });
  await pg.waitReady;
  await pg.exec(`SET search_path TO ${SEARCH_PATH}; SET TIME ZONE 'UTC';`);
  const wrap = (q: { query: Executor['query']; exec: (sql: string) => Promise<unknown> }): Executor => ({
    query: (sql, params) => q.query(sql, params),
    exec: async (sql) => {
      await q.exec(sql);
    }
  });
  return {
    kind: 'pglite',
    ...wrap(pg as never),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx as never))),
    close: () => pg.close()
  };
}

async function pgDriver(url: string): Promise<Driver> {
  const { default: pg } = await import('pg');
  pg.types.setTypeParser(INT8, (v) => Number(v));
  pg.types.setTypeParser(NUMERIC, (v) => Number(v));
  const pool = new pg.Pool({
    connectionString: url,
    max: Number(process.env.KUOTA_PG_POOL_MAX) || 10,
    options: `-c search_path=${SEARCH_PATH.replace(' ', '')} -c TimeZone=UTC`
  });
  const fromClient = (c: { query: (...a: any[]) => Promise<any> }): Executor => ({
    query: (sql, params) => c.query(sql, params),
    exec: async (sql) => {
      await c.query(sql); // sin parámetros: admite varias sentencias
    }
  });
  return {
    kind: 'pg',
    ...fromClient(pool),
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(fromClient(client));
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
    },
    close: () => pool.end()
  };
}

// ------------------------------------------------------------ parámetros
// Se escribe SQL con `?` (posicional) o `@nombre` (objeto); se envía con $1..$n.
// Los booleanos se guardan como 0/1, igual que antes.
const normalize = (v: unknown) => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : v);

function replaceOutsideQuotes(sql: string, onToken: (token: string) => string, pattern: RegExp): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'" || ch === '"') {
      const end = sql.indexOf(ch, i + 1);
      const stop = end === -1 ? sql.length : end + 1;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === '-' && sql[i + 1] === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    pattern.lastIndex = i;
    const m = pattern.exec(sql);
    if (m && m.index === i) {
      out += onToken(m[0]);
      i += m[0].length;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

function compile(sql: string, params: unknown[]): { text: string; values: unknown[] } {
  const named = params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !Array.isArray(params[0]) && /@\w/.test(sql);
  if (named) {
    const obj = params[0] as Record<string, unknown>;
    const names: string[] = [];
    const text = replaceOutsideQuotes(
      sql,
      (tok) => {
        const name = tok.slice(1);
        if (!(name in obj)) throw new Error(`Falta el parámetro @${name}`);
        let idx = names.indexOf(name);
        if (idx === -1) idx = names.push(name) - 1;
        return `$${idx + 1}`;
      },
      /@[A-Za-z_]\w*/y
    );
    return { text, values: names.map((n) => normalize(obj[n])) };
  }
  let n = 0;
  const text = replaceOutsideQuotes(sql, () => `$${++n}`, /\?/y);
  if (n !== params.length) throw new Error(`La consulta espera ${n} parámetros y recibió ${params.length}`);
  return { text, values: params.map(normalize) };
}

// ------------------------------------------------------------ API
const txStore = new AsyncLocalStorage<{ driver: Driver; executor: Executor }>();

export interface Statement {
  get<T = any>(...params: unknown[]): Promise<T | undefined>;
  all<T = any>(...params: unknown[]): Promise<T[]>;
  run(...params: unknown[]): Promise<{ changes: number }>;
}

export class Db {
  private driver: Driver | null = null;

  constructor(readonly name: string) {}

  attach(driver: Driver) {
    this.driver = driver;
  }

  get kind() {
    return this.need().kind;
  }

  private need(): Driver {
    if (!this.driver) throw new Error(`Base de datos "${this.name}" sin inicializar (falta initDatabase()).`);
    return this.driver;
  }

  /** La transacción en curso si es de este mismo driver; si no, el pool. */
  private executor(): Executor {
    const driver = this.need();
    const store = txStore.getStore();
    return store && store.driver === driver ? store.executor : driver;
  }

  async all<T = any>(sql: string, ...params: unknown[]): Promise<T[]> {
    const { text, values } = compile(sql, params);
    return (await this.executor().query<T>(text, values)).rows;
  }

  async get<T = any>(sql: string, ...params: unknown[]): Promise<T | undefined> {
    return (await this.all<T>(sql, ...params))[0];
  }

  async run(sql: string, ...params: unknown[]): Promise<{ changes: number }> {
    const { text, values } = compile(sql, params);
    const r = await this.executor().query(text, values);
    return { changes: r.affectedRows ?? r.rowCount ?? 0 };
  }

  prepare(sql: string): Statement {
    return {
      get: (...p) => this.get(sql, ...p),
      all: (...p) => this.all(sql, ...p),
      run: (...p) => this.run(sql, ...p)
    };
  }

  /** Varias sentencias sin parámetros (migraciones). */
  async exec(sql: string): Promise<void> {
    await this.executor().exec(sql);
  }

  /** Ejecuta `fn` en una transacción; anidada, se une a la que está en curso. */
  async tx<T>(fn: () => Promise<T>): Promise<T> {
    const driver = this.need();
    const store = txStore.getStore();
    if (store && store.driver === driver) return fn();
    return driver.transaction((executor) => txStore.run({ driver, executor }, fn));
  }

  /** Estilo anterior: `await db.transaction(async () => { ... })()`. */
  transaction<A extends unknown[], R>(fn: (...args: A) => Promise<R>): (...args: A) => Promise<R> {
    return (...args: A) => this.tx(() => fn(...args));
  }

  /** Bloqueo exclusivo hasta el fin de la transacción (serializa una sección crítica). */
  async lock(key: string): Promise<void> {
    await this.run('SELECT pg_advisory_xact_lock(hashtextextended(?, 0))', key);
  }
}

/** Núcleo (comercios, onboarding, crédito, ventas). */
export const db = new Db('core');
/** Zona de dinero (links, pagos, libro, riesgo, bitácora). En producción, otro usuario de base. */
export const paymentsDb = new Db('payments');

const drivers: Driver[] = [];

export async function connectDatabases() {
  if (drivers.length) return;
  const coreUrl = process.env.DATABASE_URL;
  if (coreUrl) {
    const core = await pgDriver(coreUrl);
    const pay = process.env.PAYMENTS_DATABASE_URL ? await pgDriver(process.env.PAYMENTS_DATABASE_URL) : core;
    db.attach(core);
    paymentsDb.attach(pay);
    drivers.push(core, ...(pay === core ? [] : [pay]));
    return;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Falta DATABASE_URL en producción.');
  const dir = process.env.KUOTA_PG_DATA ?? path.resolve(process.cwd(), '.pgdata');
  const local = await pgliteDriver(dir === ':memory:' ? undefined : dir);
  db.attach(local);
  paymentsDb.attach(local);
  drivers.push(local);
}

export async function closeDatabases() {
  await Promise.all(drivers.splice(0).map((d) => d.close()));
}
