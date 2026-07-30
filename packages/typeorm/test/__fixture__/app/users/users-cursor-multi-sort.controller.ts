import { Controller } from '@nestjs/common';
import { Crud } from '@nestjs-crud/core';

import { User } from './user.entity';
import { UsersService } from './users.service';

/**
 * Fixture controller proving a multi-field route default still returns 400
 * for cursor-mode `getMany` rather than silently using its first field.
 *
 * Mounted at `/users-cursor-multi-sort` with a two-field default sort
 * (`id` ASC, `companyId` ASC) and a limit of 5.
 */
@Crud({
  model: { type: User },
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
