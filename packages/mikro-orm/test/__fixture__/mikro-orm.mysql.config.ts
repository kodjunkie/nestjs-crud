import { defineConfig } from '@mikro-orm/mysql';

import { Company, Project, User } from './entities';

export default defineConfig({
  entities: [Company, User, Project],
  host: 'localhost',
  port: 3316,
  user: 'nestjs_crud',
  password: 'nestjs_crud',
  dbName: 'nestjs_crud',
  allowGlobalContext: true,
  debug: false,
});
