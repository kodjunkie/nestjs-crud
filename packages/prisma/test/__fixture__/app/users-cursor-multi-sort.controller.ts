import { Controller } from '@nestjs/common';

import { Crud } from '@nestjs-crud/core';

import { UserModel } from './user-model';
import { UsersService } from './users.service';

/**
 * Fixture controller for the cursor multi-field-default 400 cell.
 *
 * Mounted at `/users-cursor-multi-sort`. Declares a two-field default sort
 * (`id` ASC, `companyId` ASC) via `@Crud({ query: { sort } } })`. Cursor
 * pagination supports only a single sort field, so a request with no
 * `?sort=` against this route must 400 naming the route default as the
 * origin — it must never silently fall back to `default[0]`.
 */
@Crud({
  model: { type: UserModel },
  query: {
    pagination: 'cursor',
    limit: 5,
    sort: [
      { field: 'id', order: 'ASC' },
      { field: 'companyId', order: 'ASC' },
    ],
  },
})
@Controller('users-cursor-multi-sort')
export class UsersCursorMultiSortController {
  constructor(public service: UsersService) {}
}
