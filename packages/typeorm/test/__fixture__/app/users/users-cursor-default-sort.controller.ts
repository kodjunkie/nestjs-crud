import { Controller } from '@nestjs/common';
import { Crud } from '@nestjs-crud/core';

import { User } from './user.entity';
import { UsersService } from './users.service';

/**
 * Fixture controller proving cursor-mode `getMany` honors the route's
 * `@Crud({ query: { sort } })` default when the request has no `?sort=`.
 *
 * Mounted at `/users-cursor-default-sort` with a single-field default sort
 * (`id` ASC) and a limit of 5. A request with no sort parameter must return
 * 200 with a keyset page whose next cursor decodes to `id`.
 */
@Crud({
  model: { type: User },
  query: { pagination: 'cursor', limit: 5, sort: [{ field: 'id', order: 'ASC' }] },
})
@Controller('users-cursor-default-sort')
export class UsersCursorDefaultSortController {
  constructor(public service: UsersService) {}
}
