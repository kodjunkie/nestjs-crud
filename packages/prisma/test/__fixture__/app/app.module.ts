import { DynamicModule, Module } from '@nestjs/common';

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

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PrismaClient } = require('../../../../../node_modules/.prisma/client-smoke');
    const prismaClient = new PrismaClient();

    return {
      module: AppModule,
      controllers: [UsersController],
      providers: [{ provide: PRISMA_CLIENT, useValue: prismaClient }, UsersService],
      exports: [UsersService],
    };
  }
}
