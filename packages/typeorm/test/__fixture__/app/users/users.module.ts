import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './user.entity';
import { UserProfile } from '../users-profiles/user-profile.entity';
import { UsersService } from './users.service';
import { UsersCachedController } from './users-cached.controller';
import { UsersCursorController } from './users-cursor.controller';
import { UsersCursorNoLimitController } from './users-cursor-no-limit.controller';
import { UsersCursorDefaultSortController } from './users-cursor-default-sort.controller';
import { UsersController } from './users.controller';
import { UsersWithStrategyController } from './users-with-strategy.controller';
import { MeController } from './me.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserProfile])],
  providers: [UsersService],
  exports: [UsersService],
  controllers: [
    UsersController,
    UsersWithStrategyController,
    MeController,
    UsersCachedController,
    UsersCursorController,
    UsersCursorNoLimitController,
    UsersCursorDefaultSortController,
  ],
})
export class UsersModule {}
