# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [Unreleased]

### Added

- **NestJS 12 support.** The `@nestjs/common` peer range and the `@nestjs/typeorm` peer range now accept `^12.0.0` alongside `^10.0.0 || ^11.0.0`.
- **TypeORM 1.x support.** The `typeorm` peer range accepts `^1.0.0`. The test suite runs on TypeORM 1.1.1. Installing with npm can hit an `ERESOLVE` conflict, because TypeORM 1.1.1's optional `ioredis` peer (`^5`) conflicts with NestJS 12's optional `ioredis` peer, which npm resolves to 6.x — add `ioredis@^5` to your app's dependencies, or an `"overrides": { "ioredis": "^5.0.4" }` entry to its `package.json`, to work around it.
- **node-redis 6 support.** The `redis` peer range moves from `^5.0.0` to `^5.0.0 || ^6.0.0`. The Redis cache strategy works unchanged with a node-redis 6 client.

### Changed

- **Node 22.12.0 or later is now required (`engines.node`), raised from `>=22.0.0`.** NestJS 12 ships as ESM only, and this package is CommonJS; it loads that ESM package through Node's `require()`-of-ESM support, which lands at 22.12.0.
- **Requires `@nestjs-crud/core` 2.2.6 or later.** The `@nestjs-crud/core` peer range moves from `^2.0.0` to `^2.2.6`. This package calls core helpers added after 2.0.0, so an older core satisfied the old range without providing them.
- **Under `relationLoadStrategy: 'query'`, an orphan nested join no longer loads its parent implicitly.** A `?join=` entry whose parent relation is not also joined now returns the same 400 as the default `'join'` strategy, instead of silently loading only the parent.

### Fixed

- **A nested `?join=` entry whose parent is not joined now returns 400 instead of crashing with a 500.** Requesting `profile.licenses` without also joining `profile` previously registered a join with an undefined path and threw a low-level `TypeError` once the query executed. It now returns `400 Invalid join: 'profile.licenses'` before any SQL is built. A parent counts as joined when it is requested or marked `eager`, in any order and at any depth.
- **A nested join listed before its parent in `?join=` now works.** Previously, a request whose parent relation was requested first only "worked" because clients happened to order fields that way; a first request listing the child before the parent (or an orphan request) could leave a broken relation cached, breaking every later nested-join request against the same route until restart. Both orderings now resolve correctly and no longer poison later requests.

### Security

- **`typeorm` floor raised to 0.3.30 on the 0.3 line.** The peer range moves from `^0.3.0` to `^0.3.30 || ^1.0.0`, so consumers who pin low no longer get older, vulnerable 0.3 releases.
- **Under `relationLoadStrategy: 'query'`, a nested join now requires its full dotted path in `@Crud({ query: { join } })`.** Previously, any nested relation under an allowlisted top-level relation could be loaded by adding it to `?join=`, even when the route never allowlisted that nested path. Routes that relied on the old fallback must now list the nested path explicitly.

## [2.2.6] — 2026-07-31

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
- `typeorm` peer/runtime range bumped to `^0.3.30`; `@nestjs/typeorm` to `^11.0.1`. Within existing major bands; no consumer migration required.

See the [root CHANGELOG.md](../../CHANGELOG.md#222--2026-05-19) for the full v2.2.2 release notes (5 dependabot advisories closed; runtime dep refresh).


## [2.2.1] — 2026-05-03

No consumer source changes. Test-fixture-only fix and test-suite reliability hardening; see the [root CHANGELOG.md](../../CHANGELOG.md#221--2026-05-03) for full release details.

### Fixed

- `cursor.spec` cell 9 no longer hard-deletes the seeded `companyId=1, profileId=5` user, which was causing `c.basic-crud`'s `/users4/1/5` compound-primary-key route test to fail under the `release.yml` MySQL runner (it.skip-ped at v2.2.0 release time). Test-fixture-only — `TypeOrmCrudService` runtime is unchanged.


## [2.2.0] — 2026-05-03

### Added

- Cursor pagination support: `TypeOrmQueryComposer.applyCursor` adds parameterized OR-decomposed keyset WHERE with primary-key tie-breaker on top of the existing sort branch. `getMany` honors `@Crud({ query: { pagination: 'cursor' } })` with single-page forward and back navigation; cursor mode bypasses the query cache wrap. The `sortField` decoded from the cursor token flows through the same `entityColumnsHash` allowlist used for offset-mode `?sort=` — no new SQL injection surface.
- `TypeOrmCacheStrategy` — bring-your-own Redis-backed `CacheStrategy` implementation. Accepts node-redis v5, ioredis, or any custom `RedisLike` client; auto-connects on first cache operation. Uses non-blocking `scanPrefix` for entity-prefix invalidation. Provides single-flight de-duplication.
- `ioredis: ^5.0.0` declared as an optional `peerDependency`. Install either `redis@^5` or `ioredis@^5` depending on which client you bring; consumers using neither do not need either installed.
- `TypeOrmCrudService` constructor accepts an optional third `cacheStrategy` argument. Existing `super(repo)` and `super(repo, logger)` calls continue to work unchanged.
- When a `CacheStrategy` is wired, the adapter skips its native `query.cache(ttl)` step in `QueryComposer` to prevent double-caching. The legacy `DataSource.cache` provider continues to work as a fallback when no `CacheStrategy` is configured. The legacy native pass-through is marked `@deprecated` (since 2.2.0) and is on a v3 removal track.
- All six write methods auto-invalidate the entity-prefix cache after a successful commit.
- Honors `cacheErrorPolicy` from `CrudConfigService.config.query` — set to `'fallback-to-source'` for graceful degradation when Redis is down.


## [2.0.0](https://github.com/kodjunkie/nestjs-crud/compare/v1.0.2...v2.0.0) (2026-04-23)

Coordinated v2.0.0 milestone release. See the [root CHANGELOG.md](../../CHANGELOG.md#200--2026-04-23) and the [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration) for full breaking-change details.


### Breaking

* **query:** Strict field allowlist on `?sort=`, `?filter=`, `?search=` — unknown fields now throw `RequestQueryException`.
* **cache:** `@Crud({ query: { cache } })` now throws `CrudCacheNotConfiguredError` if `DataSource({ cache: ... })` is not configured.


### Features

* **query:** Service decomposed from 1023 → 249 lines. Composes `WhereBuilder` + `QueryComposer` + `FetchHelper` under shared `QueryTranslator` facade.
* **logging:** Optional `LoggerService` ctor parameter.
* **performance:** `relationLoadStrategy: 'join' | 'query'` per-controller and per-request switch. Avoids Cartesian explosion on multi-OneToMany reads.


### Security

* **mutations:** `updateOne`/`replaceOne`/`deleteOne` now run inside `READ COMMITTED` transactions. Closes the v1 read-modify-write race.


### Performance

* **count:** `QueryTranslator.count()` shared across adapters.


### Internal

* **engines:** Node `>=22.0.0` enforced.


## [1.0.2](https://github.com/kodjunkie/nestjs-crud/compare/v1.0.1...v1.0.2) (2026-04-20)


### Bug Fixes

* **legal:** restore upstream attribution and refresh branding ([b0b9da6](https://github.com/kodjunkie/nestjs-crud/commit/b0b9da67aee4772e77dfbc7bd76f8aae201a8ee2))
* **typeorm:** remove /g flag from sqlInjectionRegEx to prevent stateful .test() lastIndex bug ([63c463d](https://github.com/kodjunkie/nestjs-crud/commit/63c463d66b1ff2f2c9751d7cc740320197b9f609))
