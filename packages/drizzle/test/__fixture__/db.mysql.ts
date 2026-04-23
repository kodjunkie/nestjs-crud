import { createPool } from 'mysql2/promise';
import { drizzle, MySql2Database } from 'drizzle-orm/mysql2';

import * as schema from './schema.mysql';

export type MysqlDb = MySql2Database<typeof schema>;

let _pool: ReturnType<typeof createPool> | null = null;

export function createMysqlClient(): MysqlDb {
  _pool = createPool({
    uri: 'mysql://nestjs_crud:nestjs_crud@localhost:3316/nestjs_crud',
  });

  return drizzle(_pool, { schema, mode: 'default' });
}

export async function tearDownMysql(): Promise<void> {
  if (_pool) {
    await (await _pool).end();
    _pool = null;
  }
}
