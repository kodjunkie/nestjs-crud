import { Controller } from '@nestjs/common';
import { Crud } from '@nestjs-crud/core';

import { User } from '../entities';
import { UsersService } from './users.service';

/**
 * Fixture controller for the missing-limit + cursor 400 cell. NO `limit` and
 * NO `maxLimit` — `getTake()` returns null, so `doGetManyCursor` throws 400.
 */
@Crud({
  model: { type: User },
  query: { pagination: 'cursor' },
})
@Controller('users-cursor-no-limit')
export class UsersCursorNoLimitController {
  constructor(public service: UsersService) {}
}
