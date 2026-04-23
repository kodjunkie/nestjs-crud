import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthGuard } from './auth.guard';
import { CompaniesModule } from './companies/companies.module';
import { ormConfig } from './orm.config';
import { User } from './users/user.entity';
import { UsersModule } from './users/users.module';

@Module({
  imports: [TypeOrmModule.forRoot(ormConfig), TypeOrmModule.forFeature([User]), CompaniesModule, UsersModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
  ],
})
export class AppModule {}
