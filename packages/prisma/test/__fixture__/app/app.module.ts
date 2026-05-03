import { DynamicModule, Module } from '@nestjs/common';

import { UsersCachedController } from './users-cached.controller';
import { UsersCursorController } from './users-cursor.controller';
import { UsersCursorNoLimitController } from './users-cursor-no-limit.controller';
import { UsersController } from './users.controller';
import { UsersService, PRISMA_CLIENT } from './users.service';

@Module({})
export class AppModule {
  static forRoot(dialect: 'postgres' | 'mysql'): DynamicModule {
    // Set env vars before requiring PrismaClient so the generated client uses the right URL
    if (dialect === 'postgres') {
      require('../db.postgres').setEnv();
    } else {
      require('../db.mysql').setEnv();
    }

    // Prisma v7: PrismaClient ctor no longer accepts `datasources`/`datasourceUrl`
    // and does not auto-read env.DATABASE_URL. The shared factory wires the
    // correct driver adapter (@prisma/adapter-pg / @prisma/adapter-mariadb)
    // from the URL populated by setEnv() above. See D-01 amendment.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { makePrismaClient } = require('../make-prisma-client');
    const prismaClient = makePrismaClient(dialect);

    return {
      module: AppModule,
      controllers: [UsersController, UsersCachedController, UsersCursorController, UsersCursorNoLimitController],
      providers: [{ provide: PRISMA_CLIENT, useValue: prismaClient }, UsersService],
      exports: [UsersService],
    };
  }
}
