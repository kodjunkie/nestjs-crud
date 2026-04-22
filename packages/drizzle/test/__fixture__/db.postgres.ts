import { Pool } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';

import * as schema from './schema.postgres';

export type PostgresDb = NodePgDatabase<typeof schema>;

let _pool: Pool | null = null;

export function createPostgresClient(): PostgresDb {
  _pool = new Pool({
    connectionString: 'postgres://root:root@localhost:5455/nestjs_crud',
  });

  return drizzle(_pool, { schema });
}

export async function tearDownPostgres(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
