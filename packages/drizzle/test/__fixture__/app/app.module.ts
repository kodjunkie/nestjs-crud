import { DynamicModule, Module } from '@nestjs/common';

import { createPostgresClient } from '../db.postgres';
import { createMysqlClient } from '../db.mysql';
import * as pgSchema from '../schema.postgres';
import * as mysqlSchema from '../schema.mysql';

import { UsersCachedController } from './users-cached.controller';
import { UsersController } from './users.controller';
import { UsersService, DRIZZLE_DB, DRIZZLE_TABLE } from './users.service';

@Module({})
export class AppModule {
  static forRoot(dialect: 'postgres' | 'mysql'): DynamicModule {
    const db = dialect === 'postgres' ? createPostgresClient() : createMysqlClient();
    const table = dialect === 'postgres' ? pgSchema.users : mysqlSchema.users;

    return {
      module: AppModule,
      controllers: [UsersController, UsersCachedController],
      providers: [{ provide: DRIZZLE_DB, useValue: db }, { provide: DRIZZLE_TABLE, useValue: table }, UsersService],
      exports: [UsersService],
    };
  }
}
