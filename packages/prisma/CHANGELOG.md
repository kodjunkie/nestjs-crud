# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [Unreleased]

### Added

- `PrismaCrudService` now emits the same debug-level `CrudService initialized: <model>` constructor log as the TypeORM, Drizzle, and MikroORM adapters (visible only when debug logging is enabled). Closes a logging-parity gap — the Prisma adapter was previously silent at initialization.

## [2.2.3] — 2026-06-10

Version-only republish — no package-specific source changes. Bumped in lockstep with the rest of the monorepo. See the [root CHANGELOG.md](../../CHANGELOG.md#223--2026-06-10) for full release details.

## [2.2.2] — 2026-05-19

### Changed

- Declared `mysql2: ^3.0.0` and `pg: ^8.0.0` as optional `peerDependencies` (`peerDependenciesMeta.{mysql2,pg}.optional: true`). Consumers install only the driver their backend uses.
- `@prisma/client` dev/peer range bumped to `^7.8.0` (verified against `prisma@7.8.x`). Within the existing `^7` band; no consumer migration required.

See the [root CHANGELOG.md](../../CHANGELOG.md#222--2026-05-19) for the full v2.2.2 release notes (5 dependabot advisories closed; runtime dep refresh).


## [2.2.1] — 2026-05-03

Version-only republish — no package-specific source changes. Bumped in lockstep with the rest of the monorepo. See the [root CHANGELOG.md](../../CHANGELOG.md#221--2026-05-03) for full release details.


## [2.2.0] — 2026-05-03

### Added

- Cursor pagination support: `PrismaQueryComposer.applyCursor` emits OR-decomposed `where` merged with the existing where via `AND` (preserving `@CrudAuth` filters and soft-delete predicates), with primary-key tie-breaker `orderBy`. Prisma's built-in `cursor:` argument is intentionally bypassed — it is single-column unique-key only and cannot accept the `(sortField, id)` tuple. `getMany` honors `@Crud({ query: { pagination: 'cursor' } })`; cursor mode bypasses the query cache wrap (both Redis and Accelerate strategies). The `sortField` decoded from the cursor flows through the same `entityColumns` allowlist used for offset-mode `?sort=`.
- `PrismaRedisCacheStrategy` — bring-your-own Redis-backed `CacheStrategy` implementation. Accepts node-redis v5, ioredis, or any custom `RedisLike` client; auto-connects on first cache operation. Same SCAN+DEL invalidation pattern as the other adapters. Provides single-flight de-duplication. `PrismaAccelerateCacheStrategy` is unaffected.
- `ioredis: ^5.0.0` declared as an optional `peerDependency` (joining the existing `redis: ^5.0.0` optional peer). Consumers using only Accelerate (or neither Redis strategy) do not need either installed.
- `PrismaAccelerateCacheStrategy` — Prisma Accelerate-backed `CacheStrategy`. Attaches `cacheStrategy: { ttl }` to the per-query Prisma delegate args via shared async-context, so the cache lives at the Accelerate gateway. Converts ttl from milliseconds to seconds via `Math.ceil(ttl / 1000)` to match Accelerate's per-query API. `invalidate(prefix)` calls `$accelerate.invalidate({ tags: [prefix] })`.
- `PrismaCrudServiceConfig<T>` accepts an optional `cacheStrategy` field. The `getDelegate()` thunk is preserved inside cache closures so per-`$transaction` scoping still holds under cache hits.
- All six CrudService write methods auto-invalidate the entity-prefix cache after a successful commit.
- `PrismaFetchHelper` throws `CrudCacheNotConfiguredError` when `@Crud({ query: { cache } })` is set without a wired `cacheStrategy`. Mirrors the TypeORM fail-fast behavior for cache misconfiguration.
- Honors `cacheErrorPolicy` from `CrudConfigService.config.query` — set to `'fallback-to-source'` for graceful degradation when Redis or Accelerate is down.

### Changed

- `@prisma/extension-accelerate` is now declared as an optional `peerDependency` (`^3.0.0`) on `@nestjs-crud/prisma` (modeled on `@nestjs-crud/core`'s `@nestjs/swagger` optional peer pattern). Consumers without Accelerate install cleanly; instantiating `PrismaAccelerateCacheStrategy` against a client missing the extension throws a clear error.
- `redis` is declared as an optional `peerDependency` (`^5.0.0`) on `@nestjs-crud/prisma`. `ioredis` is now also declared as an optional `peerDependency` (`^5.0.0`). Consumers using only Accelerate (or neither Redis strategy) do not need either installed.

## [2.1.0] (2026-04-23) — @prisma/client ^7.0.0 peer bump

The `@prisma/client` peer range narrows from `>=5.0.0` to `^7.0.0`. The adapter's runtime API is unchanged — `PrismaCrudService` constructor, method signatures, and `$transaction` usage all compile and run against Prisma 7 with no consumer source changes.

Consumer-side migration work is concentrated in three steps: (1) drop the `datasource.url` line from every `schema.prisma` datasource block, (2) create a `prisma.config.ts` that forwards `DATABASE_URL` for the Migrate CLI (or pass `url` via the `PrismaClient` constructor using a driver adapter), and (3) drop the `--skip-generate` flag from any direct `prisma db push` invocation (the flag is hard-removed in v7, not deprecated-with-warning).

Full walkthrough, including two driver-adapter gotchas that are not called out in Prisma's own release notes, in the [v2.1 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2.1-Migration).

### Changed

- **Peer range.** `@prisma/client`: `>=5.0.0` → `^7.0.0`. Widening to `^5 || ^6 || ^7` was considered and rejected — testing three Prisma majors is maintenance cost without consumer value given v7 is current.

### Dev-deps (repo-internal)

- `prisma` and `@prisma/client` root dev-deps bumped to `^7.0.0` (resolves `7.8.0` at release time). No effect on the shipped artifact.

### See also

- [v2.1 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2.1-Migration)
- [ServicePrisma wiki page](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma) — updated with v7 connection examples

## [2.0.0](https://github.com/kodjunkie/nestjs-crud/releases/tag/v2.0.0) (2026-04-23)

Initial release. `@nestjs-crud/prisma` ships at v2.0.0 — same conceptual surface as the other adapters (`@nestjs-crud/typeorm`, `@nestjs-crud/drizzle`, `@nestjs-crud/mikro-orm`).

See the [root CHANGELOG.md](../../CHANGELOG.md#200--2026-04-23), the [ServicePrisma wiki page](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma), and the [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration) for full details.


### Features

* **adapter:** `PrismaCrudService<T>` — translates parsed CRUD requests into Prisma client operations.
* **query:** Composes `WhereBuilder` + `QueryComposer` + `FetchHelper` under shared `QueryTranslator` facade (same shape as the other adapters).
* **logging:** Optional `LoggerService` ctor parameter.


### Security

* **mutations:** Mutation methods (`updateOne`/`replaceOne`/`deleteOne`) run inside `READ COMMITTED` transactions.


### Internal

* **engines:** Node `>=22.0.0` enforced.
* Real-DB integration tests cover Postgres + MySQL.
