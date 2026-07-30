# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [Unreleased]

### Fixed

- **Cursor-mode `getMany` resolves sort through the shared core helper.** A route-declared single-field default sort now applies when the request omits `?sort=`, matching offset mode's resolution order. See the root CHANGELOG for the full behavior description.

## [2.2.5] — 2026-06-11

Version-only republish — no package-specific source changes. Bumped in lockstep with the rest of the monorepo. See the [root CHANGELOG.md](../../CHANGELOG.md#225--2026-06-11) for full release details.


## [2.2.4] — 2026-06-10

Version-only republish — no package-specific source changes. Bumped in lockstep with the rest of the monorepo. See the [root CHANGELOG.md](../../CHANGELOG.md#224--2026-06-10) for full release details.


## [2.2.3] — 2026-06-10

Version-only republish — no package-specific source changes. Bumped in lockstep with the rest of the monorepo. See the [root CHANGELOG.md](../../CHANGELOG.md#223--2026-06-10) for full release details.

## [2.2.2] — 2026-05-19

### Changed

- Declared `mysql2: ^3.0.0` and `pg: ^8.0.0` as optional `peerDependencies` (`peerDependenciesMeta.{mysql2,pg}.optional: true`). Consumers install only the driver their backend uses.
- `drizzle-orm` peer/runtime range bumped to `^0.45.2`. No consumer migration required.

See the [root CHANGELOG.md](../../CHANGELOG.md#222--2026-05-19) for the full v2.2.2 release notes (5 dependabot advisories closed; runtime dep refresh).


## [2.2.1] — 2026-05-03

Version-only republish — no package-specific source changes. Bumped in lockstep with the rest of the monorepo. See the [root CHANGELOG.md](../../CHANGELOG.md#221--2026-05-03) for full release details.


## [2.2.0] — 2026-05-03

### Added

- Cursor pagination support: `DrizzleQueryComposer.applyCursor` emits `or(gt/lt(sortCol, v), and(eq(sortCol, v), gt/lt(idCol, id)))` keyset WHERE per the official Drizzle cursor-pagination guide, with primary-key tie-breaker via `asc`/`desc`. `getMany` honors `@Crud({ query: { pagination: 'cursor' } })`; cursor mode bypasses the query cache wrap. The `sortField` decoded from the cursor flows through the same `columnsMap` allowlist used for offset-mode `?sort=`.
- `DrizzleCacheStrategy` — bring-your-own Redis-backed `CacheStrategy` implementation. Constructor takes a config object (`{ redisClient }`); `redisClient` accepts node-redis v5, ioredis, or any custom `RedisLike` client; auto-connects on first cache operation. Provides single-flight de-duplication.
- `ioredis: ^5.0.0` declared as an optional `peerDependency` (joining the existing `redis: ^5.0.0` optional peer). Consumers using neither do not need either installed.
- `DrizzleCrudService` constructor accepts an optional fifth `cacheStrategy` argument. Existing constructor signatures continue to work unchanged.
- The strategy is independent of Drizzle's first-party `Cache` abstract class (which is SQL-hash-keyed and incompatible with our entity-prefix invalidation).
- All six write methods auto-invalidate the entity-prefix cache after a successful commit.
- `DrizzleFetchHelper` now throws `CrudCacheNotConfiguredError` when `@Crud({ query: { cache } })` is set without a wired `cacheStrategy`. Mirrors the TypeORM fail-fast behavior.
- Honors `cacheErrorPolicy` from `CrudConfigService.config.query` — set to `'fallback-to-source'` for graceful degradation when Redis is down.

### Changed

- `redis` is declared as an optional `peerDependency` (`^5.0.0`) on `@nestjs-crud/drizzle`. `ioredis` is now also declared as an optional `peerDependency` (`^5.0.0`). Consumers using neither do not need either installed.


## [2.0.0](https://github.com/kodjunkie/nestjs-crud/compare/v1.0.2...v2.0.0) (2026-04-23)

Coordinated v2.0.0 milestone release. See the [root CHANGELOG.md](../../CHANGELOG.md#200--2026-04-23) and the [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration) for full breaking-change details.


### Breaking

* **types:** `DrizzleCrudService` constructor `db: any` → `db: DrizzleClient`. Subclasses must update.
* **query:** Strict field allowlist on `?sort=`, `?filter=`, `?search=` — unknown fields now throw `RequestQueryException`.


### Features

* **query:** Service decomposed (-214 lines, -35.8%). Composes `WhereBuilder` + `QueryComposer` + `FetchHelper` under shared `QueryTranslator` facade.
* **logging:** Optional `LoggerService` ctor parameter.


### Security

* **mutations:** Mutation methods now run inside `READ COMMITTED` transactions.


### Internal

* **engines:** Node `>=22.0.0` enforced.


## [1.0.2](https://github.com/kodjunkie/nestjs-crud/compare/v1.0.1...v1.0.2) (2026-04-20)


### Bug Fixes

* **legal:** restore upstream attribution and refresh branding ([b0b9da6](https://github.com/kodjunkie/nestjs-crud/commit/b0b9da67aee4772e77dfbc7bd76f8aae201a8ee2))
