import { CANONICAL_SEED_COMPANIES, CANONICAL_SEED_USERS, CANONICAL_SEED_PROJECTS } from '../../../core/test/__shared-fixture__/canonical-entities';

import * as pgSchema from './schema.postgres';
import * as mysqlSchema from './schema.mysql';

export async function seedAll(db: any, dialect: 'postgres' | 'mysql'): Promise<void> {
  const schema = dialect === 'postgres' ? pgSchema : mysqlSchema;
  const { companies, users, projects } = schema;

  if (dialect === 'mysql') {
    await db.execute('SET FOREIGN_KEY_CHECKS = 0');
    await db.execute('TRUNCATE TABLE projects');
    await db.execute('TRUNCATE TABLE users');
    await db.execute('TRUNCATE TABLE companies');
    await db.execute('SET FOREIGN_KEY_CHECKS = 1');
  } else {
    await db.delete(projects);
    await db.delete(users);
    await db.delete(companies);
  }

  await db.insert(companies).values(CANONICAL_SEED_COMPANIES.map((c) => ({ ...c })));
  await db.insert(users).values(CANONICAL_SEED_USERS.map((u) => ({ ...u })));
  await db.insert(projects).values(CANONICAL_SEED_PROJECTS.map((p) => ({ ...p })));

  console.log(`[seeds] seeded ${CANONICAL_SEED_COMPANIES.length} companies, ${CANONICAL_SEED_USERS.length} users, ${CANONICAL_SEED_PROJECTS.length} projects (${dialect})`);
}

if (require.main === module) {
  const dialect = process.argv[2] as 'postgres' | 'mysql';

  if (dialect !== 'postgres' && dialect !== 'mysql') {
    console.error('Usage: ts-node seeds.ts <postgres|mysql>');
    process.exit(1);
  }

  const { createPostgresClient } = require('./db.postgres');
  const { createMysqlClient } = require('./db.mysql');
  const db = dialect === 'postgres' ? createPostgresClient() : createMysqlClient();

  seedAll(db, dialect)
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
