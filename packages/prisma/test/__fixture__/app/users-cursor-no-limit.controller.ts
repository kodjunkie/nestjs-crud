import { Controller } from '@nestjs/common';

import { Crud } from '@nestjs-crud/core';

import { UserModel } from './user-model';
import { UsersService } from './users.service';

/**
 * Fixture controller for the missing-limit + cursor 400 cell.
 *
 * Declares `pagination: 'cursor'` with NO `limit` and NO `maxLimit` so
 * `getTake()` returns null and `doGetManyCursor` throws 400 BadRequest with
 * the "Cursor pagination requires a limit" message (D-06a).
 */
@Crud({
  model: { type: UserModel },
  query: { pagination: 'cursor' },
})
@Controller('users-cursor-no-limit')
export class UsersCursorNoLimitController {
  constructor(public service: UsersService) {}
}
