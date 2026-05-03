import { Controller } from '@nestjs/common';

import { Crud } from '@nestjs-crud/core';

import { UsersService } from './users.service';

class UserModel {
  id!: number;

  email!: string;

  isActive!: boolean;

  deletedAt?: Date | null;
}

/**
 * Fixture controller for the missing-limit + cursor 400 cell. NO `limit` and
 * NO `maxLimit` configured anywhere — getTake() returns null, cursor branch
 * throws BadRequestException('Cursor pagination requires a limit ...').
 */
@Crud({
  model: { type: UserModel },
  query: { pagination: 'cursor' },
})
@Controller('users-cursor-no-limit')
export class UsersCursorNoLimitController {
  constructor(public service: UsersService) {}
}
