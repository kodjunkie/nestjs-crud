// Prisma v7: PrismaClient ctor no longer accepts `datasources` / `datasourceUrl`
// and no longer reads env.DATABASE_URL implicitly. The only non-Accelerate
// connection path is a driver adapter. This factory wires the correct adapter
// (@prisma/adapter-pg for Postgres, @prisma/adapter-mariadb for MySQL) from
// the URL the db.{postgres,mysql}.ts setEnv() helpers populate.
//
// D-05 invariant: packages/prisma/src/** is untouched — the runtime contract
// PrismaCrudService consumes (delegates: findMany, count, create, update,
// delete, $transaction) is satisfied identically by a driver-adapter-built
// PrismaClient as by a config-URL-built one.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

type Dialect = 'postgres' | 'mysql';

// URL shape from db.postgres.ts: postgresql://root:root@host:5455/db?schema=prisma_smoke
// The `?schema=` query param was historically parsed by Prisma's Rust engine;
// node-postgres itself ignores unknown URL params, but we strip it anyway and
// forward it to the adapter's `schema` option so SET search_path still works.
function splitPostgresUrl(rawUrl: string): { connectionString: string; schema?: string } {
  const u = new URL(rawUrl);
  const schema = u.searchParams.get('schema') ?? undefined;
  u.searchParams.delete('schema');
  return { connectionString: u.toString(), schema };
}

export function makePrismaClient(dialect: Dialect): any {
  // Resolve the generated client AFTER env vars are set by the caller (db.*.ts setEnv()).
  // Use a path relative to THIS file so it resolves identically from every call
  // site (seeds.ts, app.module.ts, real-db-smoke.spec.ts).
  // This file lives at packages/prisma/test/__fixture__/make-prisma-client.ts,
  // so node_modules is 4 levels up.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require('../../../../node_modules/.prisma/client-smoke');

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('makePrismaClient: DATABASE_URL not set; call db.<dialect>.setEnv() first.');
  }

  if (dialect === 'postgres') {
    const { connectionString, schema } = splitPostgresUrl(url);
    // v7 driver-adapter surface B6: adapter-pg forwards `schema` only as
    // ConnectionInfo.schemaName (used by Prisma's ORM query builder to qualify
    // table names in generated SQL). It does NOT run `SET search_path` on
    // connect — which breaks $executeRawUnsafe/$queryRawUnsafe against objects
    // in a non-`public` schema (e.g. `ALTER SEQUENCE "Foo_id_seq"` fails with
    // "relation does not exist"). Fix: pass libpq `options=-c search_path=...`
    // in the pg PoolConfig so every pooled connection runs the SET at startup.
    const pgConfig: Record<string, unknown> = { connectionString };
    if (schema) {
      pgConfig.options = `-c search_path=${schema}`;
    }
    const adapter = new PrismaPg(pgConfig as never, schema ? { schema } : undefined);
    return new PrismaClient({ adapter });
  }

  // MySQL path — @prisma/adapter-mariadb (only officially supported v7 MySQL driver adapter).
  // The mariadb client accepts a mysql:// URL string directly.
  const adapter = new PrismaMariaDb(url);
  return new PrismaClient({ adapter });
}
