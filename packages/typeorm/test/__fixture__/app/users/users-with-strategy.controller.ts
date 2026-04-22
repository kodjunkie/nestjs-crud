import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Crud, CrudController, CrudRequest, ParsedRequest, Override } from '@nestjs-crud/core';

import { User } from './user.entity';
import { UsersService } from './users.service';

/**
 * Fixture controller for PERF-01 (Phase 10 Plan 01).
 *
 * Mirrors `users.controller.ts` but opts in to TypeORM v0.3 native split-query
 * relation loading via `@Crud({ query: { relationLoadStrategy: 'query' } })`.
 *
 * Mounted at `/users-with-strategy` (NOT under `:companyId`) so the integration
 * spec can hit `getMany` directly without a parent path param. Reuses the
 * shared `UsersService` — no new service.
 */
@Crud({
  model: {
    type: User,
  },
  query: {
    relationLoadStrategy: 'query',
    join: {
      company: {
        allow: ['name', 'domain'],
      },
      'company.projects': {
        allow: ['name', 'description'],
      },
    },
  },
})
@ApiTags('users-with-strategy')
@Controller('/users-with-strategy')
export class UsersWithStrategyController implements CrudController<User> {
  constructor(public service: UsersService) {}

  get base(): CrudController<User> {
    return this;
  }

  @Override('getManyBase')
  getAll(@ParsedRequest() req: CrudRequest) {
    return this.base.getManyBase(req);
  }
}
