import { defineConfig } from 'prisma/config';

const dialect = process.env.PRISMA_DIALECT ?? 'postgres';
const schema =
  dialect === 'mysql'
    ? 'packages/prisma/test/__fixture__/schema.mysql.prisma'
    : 'packages/prisma/test/__fixture__/schema.postgres.prisma';

// v7 Migrate rejects `datasource.url` in schema.prisma; forward it from env here.
// Preserves D-01 intent (env-driven URL) under the v7 config surface — the db.*.ts
// setEnv() helpers still own the value, prisma.config.ts is just the shim.
export default defineConfig({
  schema,
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
