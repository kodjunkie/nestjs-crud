import { MikroORM } from '@mikro-orm/core';

import {
  CANONICAL_SEED_COMPANIES,
  CANONICAL_SEED_PROJECTS,
  CANONICAL_SEED_USERS,
} from '../../../core/test/__shared-fixture__/canonical-entities';
import { Company, Project, User } from './entities';

export async function seedAll(orm: MikroORM): Promise<void> {
  await orm.getSchemaGenerator().refreshDatabase();
  const em = orm.em.fork();
  const companies = CANONICAL_SEED_COMPANIES.map((c) => em.create(Company, c as any));
  await em.persistAndFlush(companies);
  const users = CANONICAL_SEED_USERS.map((u) => {
    const { companyId, ...rest } = u as any;
    return em.create(User, { ...rest, company: companies[companyId - 1] ?? companies[0] });
  });
  await em.persistAndFlush(users);
  const projects = CANONICAL_SEED_PROJECTS.map((p) => {
    const { companyId, ...rest } = p as any;
    return em.create(Project, { ...rest, company: companies[companyId - 1] ?? companies[0] });
  });
  await em.persistAndFlush(projects);
}

async function main(): Promise<void> {
  const dialect = (process.argv[2] ?? 'postgres') as 'postgres' | 'mysql';
  const configModule =
    dialect === 'postgres'
      ? await import('./mikro-orm.postgres.config')
      : await import('./mikro-orm.mysql.config');
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
