import { defineConfig } from '@mikro-orm/postgresql';

import { Company, Project, User } from './entities';

export default defineConfig({
  entities: [Company, User, Project],
  host: 'localhost',
  port: 5455,
  user: 'root',
  password: 'root',
  dbName: 'nestjs_crud',
  allowGlobalContext: true,
  debug: false,
});
