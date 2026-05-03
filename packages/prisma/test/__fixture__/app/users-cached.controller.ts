import { Controller } from '@nestjs/common';

import { Crud } from '@nestjs-crud/core';

import { UserModel } from './user-model';
import { UsersService } from './users.service';

/**
 * Fixture controller for the cache-strategy integration spec.
 *
 * Declares `@Crud({ query: { cache: 5000 } })` so the FetchHelper's
 * `getEffectiveTtl(options)` returns 5000 at request time — exercising the
 * production TTL wiring path (D-10 contract: TTL is sourced from
 * `options.query.cache` per request, NOT from a static field).
 *
 * Mounted at `/users-cached` to avoid colliding with the existing `/users`
 * controller. Reuses `UsersService`.
 *
 * When `CrudConfigService.load({ query: { cacheStrategy } })` is called in
 * `beforeEach`, the resolved strategy is wired at request time through
 * `PrismaFetchHelper.getResolvedStrategy()` and wrap is invoked with 5000ms.
 *
 * NOTE: The existing `UsersController` does NOT declare `cache: 5000`, so
 * smoke tests are unaffected by the D-11 fail-fast behavior.
 */
@Crud({
  model: { type: UserModel },
  query: {
    cache: 5000,
    softDelete: true,
  },
  routes: { deleteOneBase: { returnDeleted: true } },
})
@Controller('users-cached')
export class UsersCachedController {
  constructor(public service: UsersService) {}
}
