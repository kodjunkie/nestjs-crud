import { Controller } from '@nestjs/common';
import { Crud } from '@nestjs-crud/core';

import { User } from '../entities';
import { UsersService } from './users.service';

/**
 * Fixture controller for the cache-strategy integration spec.
 *
 * Declares `@Crud({ query: { cache: 5000 } })` so the FetchHelper's
 * `getEffectiveTtl(options)` returns 5000 at request time — exercising the
 * production TTL wiring path (D-10 contract: TTL is sourced from
 * `options.query.cache` per request, NOT from a static field).
 *
 * Mounted at `/users-cached` to avoid colliding with the existing `/users` controller.
 * Reuses `UsersService`.
 *
 * When `CrudConfigService.load({ query: { cacheStrategy } })` is called in
 * beforeEach, the resolved strategy is wired through the service's translator
 * config and the FetchHelper will call `strategy.wrap(key, fetchFn, 5000)`.
 *
 * NOTE: The fixture does NOT configure a MikroORM Result Cache provider.
 * With `cacheStrategy` wired, the FetchHelper's cache-wrap path is activated
 * (BYO Redis bypass — MikroORM Result Cache is skipped per D-20).
 * The error test explicitly resets CrudConfigService so the strategy is absent.
 */
@Crud({
  model: { type: User },
  query: { cache: 5000, softDelete: true },
  routes: { deleteOneBase: { returnDeleted: true } },
})
@Controller('users-cached')
export class UsersCachedController {
  constructor(public service: UsersService) {}
}
