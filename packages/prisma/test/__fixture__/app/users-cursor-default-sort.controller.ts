import { Controller } from '@nestjs/common';

import { Crud } from '@nestjs-crud/core';

import { UserModel } from './user-model';
import { UsersService } from './users.service';

/**
 * Fixture controller for the cursor default-sort-fallback integration spec.
 *
 * Mounted at `/users-cursor-default-sort`. Declares a single-field default
 * sort (`id` ASC) via `@Crud({ query: { sort } } })`, so a cursor-mode
 * request with no `?sort=` resolves to this route default instead of 400.
 * `limit: 5` keeps page size predictable for the spec's assertions.
 */
@Crud({
  model: { type: UserModel },
  query: { pagination: 'cursor', limit: 5, sort: [{ field: 'id', order: 'ASC' }] },
})
@Controller('users-cursor-default-sort')
export class UsersCursorDefaultSortController {
  constructor(public service: UsersService) {}
}
