import { DynamicModule, Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';

import { UserSchema, CompanySchema, ProjectSchema } from '../entities';
import { UsersController } from './users.controller';
import { UsersRepoController } from './users-repo.controller';
import { UsersService } from './users.service';
import { UsersRepoService } from './users-repo.service';

@Module({})
export class AppModule {
  static async forRoot(dialect: 'postgres' | 'mysql'): Promise<DynamicModule> {
    const { default: config } =
      dialect === 'postgres' ? await import('../mikro-orm.postgres.config') : await import('../mikro-orm.mysql.config');

    return {
      module: AppModule,
      imports: [MikroOrmModule.forRoot(config), MikroOrmModule.forFeature([UserSchema, CompanySchema, ProjectSchema])],
      controllers: [UsersController, UsersRepoController],
      providers: [UsersService, UsersRepoService],
      exports: [UsersService, UsersRepoService],
    };
  }
}
