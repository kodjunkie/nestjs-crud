import { execSync } from 'node:child_process';

import {
  CANONICAL_SEED_COMPANIES,
  CANONICAL_SEED_USERS,
  CANONICAL_SEED_PROJECTS,
} from '../../../core/test/__shared-fixture__/canonical-entities';

async function main(dialect: 'postgres' | 'mysql'): Promise<void> {
  if (dialect === 'postgres') {
    require('./db.postgres').setEnv();
  } else {
    require('./db.mysql').setEnv();
  }

  const schema =
    dialect === 'postgres'
      ? 'packages/prisma/test/__fixture__/schema.postgres.prisma'
      : 'packages/prisma/test/__fixture__/schema.mysql.prisma';

  execSync(
    `npx prisma db push --schema=${schema} --force-reset --accept-data-loss --skip-generate`,
    { stdio: 'inherit' },
  );

  execSync(`npx prisma generate --schema=${schema}`, { stdio: 'inherit' });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PrismaClient } = require('../../../../node_modules/.prisma/client-smoke');
  const prisma = new PrismaClient();

  try {
    for (const c of CANONICAL_SEED_COMPANIES) {
      await prisma.company.create({ data: { ...c } });
    }

    for (const u of CANONICAL_SEED_USERS) {
      await prisma.user.create({ data: { ...u } });
    }

    for (const p of CANONICAL_SEED_PROJECTS ?? []) {
      await prisma.project.create({ data: { ...p } });
    }

    // Row-count verification — programmatic replacement for `prisma studio`.
    // Exits 1 on mismatch so CI catches under/over-seeded DB immediately.
    const expectedUsers = CANONICAL_SEED_USERS.length;
    const expectedCompanies = CANONICAL_SEED_COMPANIES.length;
    const expectedProjects = (CANONICAL_SEED_PROJECTS ?? []).length;

    const [u, c, p] = await Promise.all([
      prisma.user.count(),
      prisma.company.count(),
      prisma.project.count(),
    ]);

    if (u !== expectedUsers || c !== expectedCompanies || p !== expectedProjects) {
      console.error(
        `Seed row-count mismatch: users=${u}/${expectedUsers}, companies=${c}/${expectedCompanies}, projects=${p}/${expectedProjects}`,
      );
      await prisma.$disconnect();
      process.exit(1);
    }

    console.log(`Seeds OK: users=${u}, companies=${c}, projects=${p}`);
  } finally {
    await prisma.$disconnect();
  }
}

main(process.argv[2] as 'postgres' | 'mysql').catch((e) => {
  console.error(e);
  process.exit(1);
});
