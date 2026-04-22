import { MikroORM } from '@mikro-orm/core';

import {
  CANONICAL_SEED_COMPANIES,
  CANONICAL_SEED_PROJECTS,
  CANONICAL_SEED_USERS,
} from '../../../core/test/__shared-fixture__/canonical-entities';
import { Company, Project, User } from './entities';

export async function seedAll(orm: MikroORM): Promise<void> {
  // MikroORM v7: orm.schema returns SqlSchemaGenerator; use drop() + create() to reset.
  // MySQL: user_licenses (created by TypeORM fixture) has a FK to projects.id as int unsigned,
  // but MikroORM creates projects.id as int (signed). MySQL rejects the type mismatch even with
  // foreign_key_checks=0. Drop the unowned table first to avoid the incompatible-FK error.
  const conn = orm.em.getConnection();
  const isMysql = (conn as any).constructor?.name?.toLowerCase()?.includes('mysql');
  if (isMysql) {
    // Drop unowned tables that have FKs pointing at our tables (user_projects has FKs to both
    // projects.id and users.id, created by the TypeORM fixture with int unsigned PKs; MikroORM
    // creates those PKs as plain int, causing an incompatible-type error on CREATE even with
    // foreign_key_checks=0 — MySQL validates type compatibility regardless of FK check setting).
    await (orm.schema as any).execute('SET FOREIGN_KEY_CHECKS = 0');
    await (orm.schema as any).execute('DROP TABLE IF EXISTS `user_projects`');
    await (orm.schema as any).execute('SET FOREIGN_KEY_CHECKS = 1');
  }
  await (orm.schema as any).drop({ dropMigrationsTable: true });
  await (orm.schema as any).create();
  const em = orm.em.fork();
  const companies = CANONICAL_SEED_COMPANIES.map((c) => em.create(Company, c as any));
  await em.persist(companies).flush();
  const users = CANONICAL_SEED_USERS.map((u) => {
    const { companyId, ...rest } = u as any;
    return em.create(User, { ...rest, company: companies[companyId - 1] ?? companies[0] });
  });
  await em.persist(users).flush();
  const projects = CANONICAL_SEED_PROJECTS.map((p) => {
    const { companyId, ...rest } = p as any;
    return em.create(Project, { ...rest, company: companies[companyId - 1] ?? companies[0] });
  });
  await em.persist(projects).flush();
}

async function main(): Promise<void> {
  const dialect = (process.argv[2] ?? 'postgres') as 'postgres' | 'mysql';
  const configModule =
    dialect === 'postgres' ? await import('./mikro-orm.postgres.config') : await import('./mikro-orm.mysql.config');
  const orm = await MikroORM.init(configModule.default);
  try {
    await seedAll(orm);
  } finally {
    await orm.close(true);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
