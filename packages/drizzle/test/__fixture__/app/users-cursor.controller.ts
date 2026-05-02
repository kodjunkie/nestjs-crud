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
 * Fixture controller for cursor-pagination integration spec — Wave 0.
 *
 * Mounted at `/users-cursor` to avoid colliding with `/users`. Wave 0 ships
 * with `query: { limit: 5 }` for forward/back-nav cells. Plan 03 adds
 * `pagination: 'cursor'` to this @Crud block as part of wiring the
 * integration spec — kept out of Wave 0 so the fixture compiles before
 * the `pagination` knob lands in Plan 01.
 */
@Crud({
  model: { type: UserModel },
  query: { limit: 5 },
})
@Controller('users-cursor')
export class UsersCursorController {
  constructor(public service: UsersService) {}
}
