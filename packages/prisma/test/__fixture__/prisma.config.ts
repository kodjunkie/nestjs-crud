import { defineConfig } from 'prisma/config';

const dialect = process.env.PRISMA_DIALECT ?? 'postgres';
const schema =
  dialect === 'mysql'
    ? 'packages/prisma/test/__fixture__/schema.mysql.prisma'
    : 'packages/prisma/test/__fixture__/schema.postgres.prisma';

export default defineConfig({
  schema,
});
