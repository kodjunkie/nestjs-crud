import { defineConfig } from '@mikro-orm/mysql';

import { CompanySchema, ProjectSchema, UserSchema } from './entities';

export default defineConfig({
  entities: [CompanySchema, UserSchema, ProjectSchema],
  host: 'localhost',
  port: 3316,
  user: 'nestjs_crud',
  password: 'nestjs_crud',
  dbName: 'nestjs_crud',
  allowGlobalContext: true,
  debug: false,
  schemaGenerator: {
    // Wrap DDL in SET FOREIGN_KEY_CHECKS so drop+create work even when other tables
    // (e.g. user_licenses from TypeORM fixtures) have FKs pointing at our tables.
    disableForeignKeys: true,
  },
});
