import "server-only";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * One SQL interface over two engines:
 * - DATABASE_URL set: a real Postgres (Railway, Supabase, Neon, local) via `pg`.
 * - Otherwise: PGlite, Postgres compiled to WebAssembly, stored in .data/ and
 *   seeded with the demo data. Nothing to install or configure.
 * Both run the same migrations, so ledger triggers behave identically.
 */
export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");
const MIGRATION_LOCK = 7_240_117;

interface Engine extends Sql {
  /** Applies one migration file in a transaction, unless already applied. */
  apply(name: string, text: string): Promise<void>;
}

async function postgres(url: string): Promise<Engine> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 5 });
  return {
    async query(text, params) {
      return (await pool.query(text, params)).rows;
    },
    async apply(name, text) {
      const c = await pool.connect();
      try {
        await c.query("begin");
        // Two app instances starting together must not migrate twice.
        await c.query("select pg_advisory_xact_lock($1)", [MIGRATION_LOCK]);
        const { rowCount } = await c.query("select 1 from schema_migrations where name = $1", [name]);
        if (!rowCount) {
          await c.query(text);
          await c.query("insert into schema_migrations (name) values ($1)", [name]);
        }
        await c.query("commit");
      } catch (e) {
        await c.query("rollback");
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

async function pglite(): Promise<Engine> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.LOCAL_DB === "memory" ? undefined : path.join(process.cwd(), ".data", "ireti-db");
  if (dir) mkdirSync(dir, { recursive: true });
  const db = await PGlite.create(dir);
  return {
    async query(text, params) {
      return (await db.query(text, params)).rows as never;
    },
    async apply(name, text) {
      await db.transaction(async (tx) => {
        await tx.exec(text);
        await tx.query("insert into schema_migrations (name) values ($1)", [name]);
      });
    },
  };
}

const migrationFiles = () => readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();

async function migrate(db: Engine) {
  await db.query("create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await db.query<{ name: string }>("select name from schema_migrations")).map((r) => r.name));
  for (const file of migrationFiles()) {
    if (done.has(file)) continue;
    await db.apply(file, readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));
  }
}

async function open(): Promise<Engine> {
  const url = process.env.DATABASE_URL;
  if (!url && process.env.NODE_ENV === "production" && process.env.ALLOW_LOCAL_DB !== "true") {
    throw new Error("Set DATABASE_URL to a Postgres database (the local database is for development).");
  }
  const db = url ? await postgres(url) : await pglite();
  await migrate(db);
  if (!url) {
    const [{ n }] = await db.query<{ n: number }>("select count(*)::int as n from hospitals");
    // SAMPLE_DATA=false starts empty. Sample payments only make sense with
    // the simulated wallet (see seedInto).
    if (n === 0 && process.env.SAMPLE_DATA !== "false") {
      await (await import("./store/seed")).seedInto(db, { withLedger: !process.env.NWC_URL });
    }
  }
  return db;
}

// One connection per process; survives hot reloads in dev.
const g = globalThis as unknown as { __iretiSql?: Promise<Engine>; __iretiMigrated?: Promise<string> };
export async function sql(): Promise<Sql> {
  g.__iretiSql ??= open().catch((e) => {
    g.__iretiSql = undefined;
    throw e;
  });
  const db = await g.__iretiSql;
  // A dev server outlives code changes: apply a newly added migration without a restart.
  if (process.env.NODE_ENV !== "production") {
    const files = migrationFiles().join();
    if (!g.__iretiMigrated || (await g.__iretiMigrated) !== files) {
      g.__iretiMigrated = migrate(db).then(() => files);
    }
    await g.__iretiMigrated;
  }
  return db;
}
