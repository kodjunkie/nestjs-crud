import { Controller } from '@nestjs/common';

import { Crud } from '@nestjs-crud/core';

import { UserModel } from './user-model';
import { UsersService } from './users.service';

/**
 * Fixture controller for cursor-pagination integration spec.
 *
 * Mounted at `/users-cursor` to avoid colliding with `/users`. Declares
 * `pagination: 'cursor'` so PrismaCrudService.getMany routes to the cursor
 * branch (peek-one-extra + OR-decomposed keyset WHERE + PK tie-breaker
 * ORDER BY). `limit: 5` keeps page size predictable for the spec's
 * forward/back-nav cells.
 */
@Crud({
  model: { type: UserModel },
  query: { pagination: 'cursor', limit: 5 },
})
@Controller('users-cursor')
export class UsersCursorController {
  constructor(public service: UsersService) {}
}
