import { Controller } from '@nestjs/common';
import { Crud } from '@nestjs-crud/core';

import { User } from './user.entity';
import { UsersService } from './users.service';

/**
 * Fixture controller for the cursor-pagination integration spec.
 *
 * Mounted at `/users-cursor` to avoid colliding with `/users`. Ships with
 * `query: { pagination: 'cursor', limit: 5 }` for forward/back-navigation cells.
 */
@Crud({
  model: { type: User },
  query: { pagination: 'cursor', limit: 5 },
})
@Controller('users-cursor')
export class UsersCursorController {
  constructor(public service: UsersService) {}
}
