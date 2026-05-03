import { Controller } from '@nestjs/common';

import { Crud } from '@nestjs-crud/core';

import { UserModel } from './user-model';
import { UsersService } from './users.service';

/**
 * Fixture controller for cursor-pagination integration spec.
 *
 * Mounted at `/users-cursor` to avoid colliding with `/users`. Declares the
 * cursor mode so DrizzleCrudService.getMany routes through doGetManyCursor.
 * `limit: 5` ensures pagination cells have multiple pages across the
 * canonical 10-user seed.
 */
@Crud({
  model: { type: UserModel },
  query: { pagination: 'cursor', limit: 5 },
})
@Controller('users-cursor')
export class UsersCursorController {
  constructor(public service: UsersService) {}
}
