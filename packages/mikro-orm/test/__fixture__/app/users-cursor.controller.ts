import { Controller } from '@nestjs/common';
import { Crud } from '@nestjs-crud/core';

import { User } from '../entities';
import { UsersService } from './users.service';

/**
 * Fixture controller for cursor-pagination integration spec.
 *
 * Mounted at `/users-cursor` to avoid colliding with `/users`. Declares
 * `pagination: 'cursor'` to opt the route into the keyset cursor branch
 * in `MikroOrmCrudService.getMany`. Limit 5 keeps page sizes small so
 * forward/back-nav cells exercise multi-page behavior on the canonical
 * 10-user seed.
 */
@Crud({
  model: { type: User },
  query: { pagination: 'cursor', limit: 5 },
})
@Controller('users-cursor')
export class UsersCursorController {
  constructor(public service: UsersService) {}
}
