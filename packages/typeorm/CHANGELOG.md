# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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
