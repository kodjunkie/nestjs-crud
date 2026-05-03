# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [Unreleased]

### Changed

- Declared `mysql2: ^3.0.0` and `pg: ^8.0.0` as optional `peerDependencies` (`peerDependenciesMeta.{mysql2,pg}.optional: true`). Consumers install only the driver their backend uses.


## [2.2.1] — 2026-05-03

Version-only republish — no package-specific source changes. Bumped in lockstep with the rest of the monorepo. See the [root CHANGELOG.md](../../CHANGELOG.md#221--2026-05-03) for full release details.


## [2.2.0] — 2026-05-03

### Added

- Cursor pagination support: `MikroOrmQueryComposer.applyCursor` emits smart-query `andWhere({ $or: [...] })` with primary-key tie-breaker. The composer remains `em`-free; the service freshly resolves `em` per call so request-scope identity-map isolation continues to hold. `getMany` honors `@Crud({ query: { pagination: 'cursor' } })`; cursor mode bypasses the query cache wrap. The `sortField` decoded from the cursor flows through the same `propertiesMap` allowlist used for offset-mode `?sort=`.
- `MikroOrmCrudService<T>` constructor now accepts `EntityManager | EntityRepository<T>`. Consumers using `@InjectRepository(User)` from `@mikro-orm/nestjs` can pass the repository directly to `super()` instead of unwrapping with `repo.getEntityManager()`. The library performs the unwrap internally via a property-based type guard, preserving the ALS-backed em proxy so request-scope identity-map isolation is unchanged.
- `MikroOrmCacheStrategy` — bring-your-own Redis-backed `CacheStrategy` implementation. Accepts node-redis v5, ioredis, or any custom `RedisLike` client; auto-connects on first cache operation. Bypasses MikroORM's Result Cache (no prefix scan support there); the strategy's own SCAN+DEL gives uniform entity-prefix invalidation matching the other adapters. Provides single-flight de-duplication.
- `ioredis: ^5.0.0` declared as an optional `peerDependency` (joining the existing `redis: ^5.0.0` optional peer). Consumers using neither do not need either installed.
- `MikroOrmCrudService` constructor accepts an optional fourth `cacheStrategy` argument (after `emOrRepo`, `entityClass`, `logger?`). Existing constructor signatures continue to work unchanged.
- The `EntityManager` thunk (`getEm()`) is preserved — the cache wrap goes around the em-resolved fetch, so request-scope identity-map isolation continues to hold even under cache hits.
- All six write methods auto-invalidate the entity-prefix cache after a successful commit.
- `MikroOrmFetchHelper` now throws `CrudCacheNotConfiguredError` when `@Crud({ query: { cache } })` is set without a wired `cacheStrategy`. Mirrors the TypeORM fail-fast behavior.
- Honors `cacheErrorPolicy` from `CrudConfigService.config.query` — set to `'fallback-to-source'` for graceful degradation when Redis is down.

### Changed

- `redis` is declared as an optional `peerDependency` (`^5.0.0`) on `@nestjs-crud/mikro-orm`. `ioredis` is now also declared as an optional `peerDependency` (`^5.0.0`). Consumers using neither do not need either installed; `MikroOrmCacheStrategy` throws `TypeError` on an unrecognized client shape.

## [2.0.1](https://github.com/kodjunkie/nestjs-crud/compare/v2.0.0...v2.0.1) (2026-04-23)


### Bug Fixes

* **deps:** drop `@mikro-orm/knex` from `peerDependencies`. v2.0.0 declared `@mikro-orm/knex: ^7.0.0`, but no stable `7.x` exists on npm (only `7.0.0-dev.*` prereleases), so `npm install @nestjs-crud/mikro-orm@2.0.0` failed with `ETARGET`. The adapter only uses `@mikro-orm/knex` for `import type { QueryBuilder }` (type-only); consumers receive the package as a transitive dep of their driver (`@mikro-orm/postgresql`, `@mikro-orm/mysql`, …).


## [2.0.0](https://github.com/kodjunkie/nestjs-crud/compare/v1.0.2...v2.0.0) (2026-04-23)

Coordinated v2.0.0 milestone release. See the [root CHANGELOG.md](../../CHANGELOG.md#200--2026-04-23) and the [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration) for full breaking-change details.


### Breaking

* **types:** Public method signatures (`getMany`/`getOne`/etc.) and internal `any` surfaces tightened. Subclasses overriding these methods must conform to typed return values.
* **MikroORM v7 required** — peer-deps bumped from `>=6.0.0` to `^7.0.0`.
* **query:** Strict field allowlist on `?sort=`, `?filter=`, `?search=` — unknown fields now throw `RequestQueryException`.


### Features

* **query:** Service decomposed (-196 lines, -36.6%). Composes `WhereBuilder` + `QueryComposer` + `FetchHelper` under shared `QueryTranslator` facade.
* **logging:** Optional `LoggerService` ctor parameter.


### Security

* **mutations:** Mutation methods now run inside `READ COMMITTED` transactions.


### Internal

* `MikroOrmFetchHelper` receives `getEm: () => EntityManager` thunk instead of caching `em`. Prevents cross-request identity-map pollution.
* **engines:** Node `>=22.0.0` enforced.


## [1.0.2](https://github.com/kodjunkie/nestjs-crud/compare/v1.0.1...v1.0.2) (2026-04-20)


### Bug Fixes

* **legal:** restore upstream attribution and refresh branding ([b0b9da6](https://github.com/kodjunkie/nestjs-crud/commit/b0b9da67aee4772e77dfbc7bd76f8aae201a8ee2))
