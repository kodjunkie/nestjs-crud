import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Crud, CrudController } from '@nestjs-crud/core';

import { User } from './user.entity';
import { UsersService } from './users.service';

/**
 * Fixture controller for the cache-strategy integration spec.
 *
 * Declares `@Crud({ query: { cache: 5000 } })` so the FetchHelper's
 * `getEffectiveTtl(options)` returns 5000 at request time — exercising the
 * production TTL wiring path (D-10 contract: TTL is sourced from
 * `options.query.cache` per request, NOT from a static field).
 *
 * Mounted at `/companies/:companyId/users-cached` to avoid colliding with the
 * existing `/companies/:companyId/users` controller. Reuses `UsersService`.
 *
 * When `CrudConfigService.load({ query: { cacheStrategy } })` is called in
 * beforeEach, the resolved strategy is wired through the service's translator
 * config and the FetchHelper will call `strategy.wrap(key, fetchFn, 5000)`.
 *
 * NOTE: The fixture DataSource (orm.config.ts `withCache`) does NOT configure a
 * TypeORM native cache provider. With `cacheStrategy` wired, step 7 of
 * QueryComposer is skipped (D-21 guard), so no `CrudCacheNotConfiguredError` is
 * thrown for normal requests. The error test explicitly resets CrudConfigService
 * so the strategy is absent AND the native cache provider is absent.
 */
@Crud({
  model: {
    type: User,
  },
  params: {
    companyId: {
      field: 'companyId',
      type: 'number',
    },
    id: {
      field: 'id',
      type: 'number',
      primary: true,
    },
  },
  query: {
    cache: 5000,
    softDelete: true,
    join: {
      profile: {
        eager: true,
        exclude: ['updatedAt'],
      },
    },
  },
})
@ApiTags('users-cached')
@Controller('/companies/:companyId/users-cached')
export class UsersCachedController implements CrudController<User> {
  constructor(public service: UsersService) {}

  get base(): CrudController<User> {
    return this;
  }
}
