import { Controller } from '@nestjs/common';

import { Crud } from '@nestjs-crud/core';

import { UserModel } from './user-model';
import { UsersService } from './users.service';

/**
 * Mounted at `/users-cursor-multi-sort`. Declares a two-field default sort
 * (`id` ASC, `companyId` ASC) with `limit: 5`. A cursor-mode request with no
 * `?sort=` must still 400 — the resolver never silently picks the first
 * field of a multi-field route default.
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
