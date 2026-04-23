import { defineConfig } from '@mikro-orm/postgresql';

import { CompanySchema, ProjectSchema, UserSchema } from './entities';

export default defineConfig({
  entities: [CompanySchema, UserSchema, ProjectSchema],
  host: 'localhost',
  port: 5455,
  user: 'root',
  password: 'root',
  dbName: 'nestjs_crud',
  allowGlobalContext: true,
  debug: false,
});
