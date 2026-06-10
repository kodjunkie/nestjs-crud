# Changelog

All notable changes to this project will be documented in this file.
See the [per-package CHANGELOGs](packages/) for adapter-specific history.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [2.2.4] — 2026-06-10

### Added

- `@nestjs-crud/prisma`: debug-level `CrudService initialized: <model>` constructor log, matching the other three adapters (logging-parity gap — Prisma was previously silent at initialization).

### Changed

- `@nestjs-crud/core`: generated OpenAPI descriptions rewritten for API consumers — no more references to library internals (`@Crud(...)` config, `CrudValidationGroups`) in operation descriptions. Per-parameter "Docs" HTML anchors are consolidated into a single Markdown "Query Syntax" reference link on the list/get-one operation descriptions; query-parameter descriptions now describe their syntax inline.

## [2.2.3] — 2026-06-10

### Fixed

- **`@nestjs-crud/core` subpath exports broken in published npm tarball (affects 2.2.0–2.2.2):** Consumers importing `@nestjs-crud/core/cache`, `@nestjs-crud/core/cursor`, or `@nestjs-crud/core/query` from the published package received `ERR_PACKAGE_PATH_NOT_EXPORTED` or `MODULE_NOT_FOUND` because `packages/core/package.json` shipped no `exports` map. An `exports` map is now included so those three subpaths resolve from the tarball. The previously-required workaround paths (`@nestjs-crud/core/lib/cache`, `/lib/cursor`, `/lib/query`) continue to resolve via explicit exports entries, and exact file paths with extensions under `lib/` resolve through a `./lib/*` wildcard. Note that the exports map restricts deep imports to this documented surface: extensionless file paths and other directory paths under `lib/` — which were never public API — no longer resolve. Internal imports in `@nestjs-crud/core` that previously referenced `@nestjs-crud/request`'s internal library path are now updated to use the request package's public root, aligning emitted type declarations with the published API surface.
- **Swagger route metadata now survives `@nestjs/swagger` 11.4.3+ exports-map changes.** Recent versions of `@nestjs/swagger` added a package `exports` map that stopped exposing `./dist/constants`, causing the four core swagger helpers to silently fall into the no-swagger degradation path and emit no OpenAPI operation, parameter, response, or tag metadata on generated CRUD routes. Core now attempts the legacy deep-require first (still preferred when the installed version exposes that path) and falls back to inlined stable `DECORATORS` metadata key strings when the deep path is blocked. The no-swagger graceful-degradation path (when `@nestjs/swagger` is genuinely not installed) is unchanged.

---

## [2.2.2] — 2026-05-19

Security-driven patch. Closes 5 dependabot advisories — 3 consumer-runtime HIGHs in the MikroORM SQL layer plus 2 dev-tree HIGHs in `fast-uri` — and sweeps an additional 4 dev-tree MED/LOW alerts via yarn resolutions. Bundles the root-deps reclassification originally tabled for v2.3.0 since it ships alongside.

### Security

- **HIGH — GHSA-cfw5-68c4-ffqp** (MikroORM SQL injection via runtime-controlled identifiers and JSON-path keys): closed by bumping `@mikro-orm/{core,mysql,postgresql,sqlite}` to `^7.0.17` (pulls patched `@mikro-orm/sql@7.0.14+`) and `@mikro-orm/knex` to `^6.6.14`. Affects consumers using the MikroORM adapter on any runtime-controlled identifier path.
- **HIGH — GHSA-pv5w-4p9q-p3v2** (Kysely JSON-path traversal injection via unsanitized path-leg metacharacters in `JSONPathBuilder.key()` / `.at()`): closed transitively via the MikroORM 7.0.17 bump (vendors patched `kysely@0.29.x`).
- **HIGH — GHSA-q3j6-qgpj-74h6** (`fast-uri` path traversal via percent-encoded dot segments) and **HIGH — GHSA-v39h-62p7-jpjc** (`fast-uri` host confusion via percent-encoded authority delimiters): closed via yarn resolution to `fast-uri@^3.1.2`. Dev-tree only (reaches via `ajv` from commitlint, prisma's dev sandbox, and ESLint), but pinned for hygiene.
- **MED — GHSA-{69xw-7hcm-h432, p77w-8qqv-26rm, qp7p-654g-cw7p}** and **LOW — GHSA-hm8q-7f3q-5f36** (multiple `hono@<4.12.18` issues: JSX HTML injection, Vary-header cache leakage, CSS injection, JWT validation): closed via yarn resolution to `hono@^4.12.18`. Dev-tree only (transitive via `prisma`'s `@prisma/dev` sandbox).
- **MED — GHSA-v2v4-37r5-5v8g** (`ip-address` XSS in `Address6` HTML-emitting methods): closed via yarn resolution to `ip-address@^10.1.1`. Dev-tree only (transitive via `socks-proxy-agent`).

### Changed

- Runtime dependency refresh: `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` `^11.1.13` → `^11.1.21`; `@nestjs/typeorm` `^11.0.0` → `^11.0.1`; `typeorm` `^0.3.28` → `^0.3.30`; `drizzle-orm` `^0.45.1` → `^0.45.2`; `redis` `5.11.0` → `5.12.1`; `qs` `6.15.0` → `6.15.2`; `class-validator` `0.14.3` → `0.15.1`. All within their declared peer ranges; no consumer migration required. Verified across 114 jest suites / 1364 tests on TypeORM/Drizzle/MikroORM/Prisma × Postgres/MySQL.
- `@nestjs/testing`, `mysql2`, and `pg` reclassified from root `dependencies` to root `devDependencies`. They were test-fixture-only — `@nestjs/testing` is imported by `packages/*/test/*.spec.ts`; `mysql2` and `pg` are referenced only by ORM `DataSource.type` configs in test fixtures. Stops them being pulled into consumer trees as transitive runtime requirements. Consumers using a Postgres or MySQL backend continue to install their chosen driver as a normal dependency in their own project, per the optional `peerDependency` declaration on each adapter package (see below).
- `mysql2: ^3.0.0` and `pg: ^8.0.0` are now declared as optional `peerDependencies` on each of `@nestjs-crud/typeorm`, `@nestjs-crud/mikro-orm`, `@nestjs-crud/drizzle`, and `@nestjs-crud/prisma`. Mirrors the `@nestjs/typeorm` ecosystem norm: consumers install only the driver they actually use; no install-time `npm WARN unmet peer` noise for the unused driver.

---

## [2.2.1] — 2026-05-03

Maintenance release. No consumer source changes. Resolves the v2.2.0 release-notes "known issue" on the `c.basic-crud` compound-primary-key route test, plus a round of test-suite reliability hardening.

### Fixed

- `cursor.spec` cell 9 (`soft-delete still applies in cursor mode`) selected `targetId` as the last id of the first cursor page. The `/users-cursor` controller is configured with `limit: 5`, so under `?sort=id,ASC` the first page returned ids `[1..5]` and `targetId` landed on user 5. User 5 is part of the shared seed (`companyId=1, profileId=5`) and is the row exercised by `c.basic-crud`'s compound-key route test `GET /users4/1/5`. The `/users-cursor` controller has no `softDelete` config so the `DELETE` was a hard delete via TypeORM remove, dropping the row from the shared `users` table. Whether the bug surfaced depended on jest's file-execution order — locally jest tended to run `c.basic-crud` first (largest file in sequencer cache) and the bug stayed hidden, but `release.yml`'s MySQL runner sequenced `cursor.spec` before `c.basic-crud` and the compound-key test then saw user 5 gone (`status: 404`). The cell now POSTs a throwaway user, captures the returned id, and DELETEs that id; the seed range is no longer touched and execution order no longer matters. Test-fixture-only — no consumer code is affected.

### Changed

- `test:typeorm:mysql` script now passes `--runInBand` to jest (`packages/typeorm/jest.config.js` is unaffected). Single-worker execution avoids parallel-worker contention against the shared MySQL container that v2.2.0 hit.
- The supertest `done(callback)` pattern is migrated to direct `await` across `packages/typeorm/test/b.query-params.spec.ts`, `packages/typeorm/test/c.basic-crud.spec.ts`, and the three `real-db-smoke.spec.ts` files (drizzle, mikro-orm, prisma). `supertest >= 7` returns a thenable from `request(server).get(...)`, so the manual callback bridge is no longer needed; failures now surface as Promise rejections with a clean stack instead of hanging to jest's 30s timeout. Behaviour unchanged.

### Removed

- The orphan `mrepo.json` file at the repo root is removed. The `@zmotivat0r/mrepo` orchestrator was already replaced with native `lerna` + `tsc -b` in v2.2.0; the config file was left behind and is no longer read by any tooling.

---

## [2.2.0] — 2026-05-03

### Added

- Opt-in cursor pagination via `@Crud({ query: { pagination: 'cursor' } })`. New cursor-mode response shape `{ data, count, cursor: { next, prev } }` on `getManyBase`. Default `'offset'` mode preserved unchanged. Honored across all four adapters (TypeORM, MikroORM, Drizzle, Prisma) via per-adapter `QueryComposer.applyCursor` emitting OR-decomposed keyset WHERE with primary-key tie-breaker. The cursor token is opaque base64-url-encoded JSON `{sortField, sortValue, id, dir}` — opaque to consumers but NOT signed; authorization stays in `@CrudAuth`. Cursor mode bypasses the unified query cache (per-cursor key cardinality is unbounded). Per-route override via `query.pagination`; controller-level default via `CrudOptions.pagination`. Multi-sort with cursor, sortField mismatch between request and decoded cursor, missing limit, and invalid or oversized cursor all return `400 Bad Request`.
- `@Crud({ serviceProperty })` decorator option to configure the controller field that holds the CrudService. Default `'service'` preserves existing behavior; consumers can name their field `usersService`, `customerService`, etc., without violating the `CrudController<T>` contract. Reserved keys (`'__proto__'`, `'constructor'`, `'prototype'`) are rejected at decoration time to prevent prototype-pollution shapes. A clear error is thrown at request time if the configured property is undefined on the controller instance.
- `MikroOrmCrudService<T>` constructor now accepts `EntityManager | EntityRepository<T>`. Consumers using `@InjectRepository(User)` from `@mikro-orm/nestjs` can pass the repository directly to `super()` instead of unwrapping with `repo.getEntityManager()`. The library performs the unwrap internally via a property-based type guard, preserving the ALS-backed em proxy so request-scope identity-map isolation is unchanged.
- Unified `CacheStrategy` interface in `@nestjs-crud/core/cache` and per-adapter implementations: `TypeOrmCacheStrategy`, `MikroOrmCacheStrategy`, `DrizzleCacheStrategy`, `PrismaRedisCacheStrategy`, and `PrismaAccelerateCacheStrategy`. `@Crud({ query: { cache: <ttl-ms> } })` is now honored end-to-end across all four adapters when a strategy is wired via `CrudConfigService.load({ query: { cacheStrategy } })` or the CrudService constructor. All `ttl` arguments are uniformly in milliseconds.
- Auto-invalidate-on-write: every CrudService write method (`createOne`, `createMany`, `updateOne`, `replaceOne`, `deleteOne`, `recoverOne`) calls `cacheStrategy.invalidate('<entityName>:')` after a successful commit. Per-request `?cache=0` opt-out works across all four adapters. `MockCacheStrategy` (Map-backed, with single-flight de-dup) ships from `@nestjs-crud/core` for tests.
- New `CacheErrorPolicy` knob (`'fail-fast' | 'fallback-to-source'`, default `'fail-fast'`) on `CrudConfigService.config.query.cacheErrorPolicy` — opt into graceful degradation when Redis or Accelerate is down. All shipped Redis-backed strategies (TypeORM, MikroORM, Drizzle, Prisma) implement single-flight de-duplication to prevent thundering-herd amplification on cold caches.

### Changed

- Cache strategies now accept both `redis` (node-redis v5) and `ioredis` clients via a narrow `RedisLike` interface exported from `@nestjs-crud/core/cache`. Auto-detection chooses the correct adapter; clients auto-connect on the first cache operation so explicit `await redis.connect()` before passing the client is no longer required. Custom backends are supported by implementing the four `RedisLike` methods (`set`, `get`, `del`, `scanPrefix`). `ioredis: ^5.0.0` is now declared as an optional `peerDependency` on all four adapter packages.
- Replaced the `@zmotivat0r/mrepo` build orchestrator with native `lerna` + TypeScript composite project references (`tsc -b`). `yarn build` now invokes `tsc -b tsconfig.json` directly; `yarn test` chains the 4 per-adapter Postgres scripts plus the root jest run for `core`/`request`/`util`; `yarn release` invokes `lerna publish` directly. Dev-tooling change only — no consumer API change. Local incremental rebuilds now use `*.tsbuildinfo` files (gitignored).
- Moved `@nestjs/swagger` and `swagger-ui-express` from root `dependencies` to root `devDependencies`. They were dev-tooling-only (test fixtures + Swagger generation in dev workflows). Consumers continue to install Swagger tooling in their own `dependencies` per the optional peerDependency declaration on `@nestjs-crud/core` shipped in 2.1.1.

### Removed

- Removed the unwired `CrudActions.DeleteAll` enum value (`'Delete-All'`) from `@nestjs-crud/core`. It was a pre-v2 holdover with no `deleteAllBase` route in `BaseRouteName` and no entry in `CrudRoutesFactory.actionsMap`, so `getAction(handler)` from a guard on any generated route never returned it. Consumers with `case CrudActions.DeleteAll:` in exhaustive `switch (action)` ACL blocks should drop the case; no behavior change at runtime.

---

## [2.1.1] — 2026-04-26

### Added

- `@nestjs/swagger` is now declared as an optional peerDependency on `@nestjs-crud/core` (`^10.0.0 || ^11.0.0`). Consumers that already use Swagger see no change; consumers without Swagger continue to install cleanly thanks to `peerDependenciesMeta.optional: true`.

### Removed

- Removed undocumented internal helpers `getSwaggerVersion` and `swaggerPkgJson` from `@nestjs-crud/core`. They were used to gate a `@nestjs/swagger` v3 compatibility path that has been unreachable since the package's peer floor moved to v10. The dropped path also included the `ApiModelProperty` fallback in the `ApiProperty` helper.

---

## [2.1.0] — 2026-04-23

**Milestone:** `@nestjs-crud/prisma` peer-range bump to `@prisma/client ^7.0.0`.
**Branch:** `master` · **Previous:** `v2.0.1`

Coordinated minor release across all seven packages (fixed-mode lerna). Only `@nestjs-crud/prisma` has a semantic change — the other six packages are version-only republishes to keep the monorepo in lockstep. The adapter's runtime API surface (`PrismaCrudService` constructor, method signatures, `$transaction` usage) is unchanged; all migration work happens on the consumer side (schema file, config file, `PrismaClient` construction).

Full walkthrough: [v2.1 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2.1-Migration).

```
yarn up @nestjs-crud/util@2.1.0 @nestjs-crud/request@2.1.0 @nestjs-crud/core@2.1.0 \
        @nestjs-crud/typeorm@2.1.0 @nestjs-crud/drizzle@2.1.0 @nestjs-crud/mikro-orm@2.1.0 \
        @nestjs-crud/prisma@2.1.0
```

### Changed

- **`@nestjs-crud/prisma` — `@prisma/client` peer range narrowed from `>=5.0.0` to `^7.0.0`.** Consumers pinned to `@prisma/client@5.x` or `@prisma/client@6.x` will see `npm WARN` peer warnings and must upgrade. Prisma 7 introduces two schema/CLI breakages that propagate to every consumer:
  - `datasource.url` is rejected in `schema.prisma` — the `url = env("DATABASE_URL")` line must be removed from every datasource block, and the connection URL forwarded either through a new `prisma.config.ts` (for Migrate — `prisma db push`, `prisma migrate`) or through the `PrismaClient` constructor via a driver adapter (for runtime).
  - `prisma db push --skip-generate` is hard-removed (not deprecated-with-warning). Any `package.json` script, Dockerfile step, or CI invocation that passes this flag now errors with `Unknown argument '--skip-generate'`. Drop the flag — `db push` now always auto-generates.

  The adapter's runtime surface is source-compatible with Prisma 7: `PrismaCrudService` constructor signature, method signatures, and `$transaction` call sites are unchanged.

### Deprecated

- **`@nestjs-crud/prisma@2.0.x` peer range** is deprecated for new installs. Consumers on `@prisma/client@5.x` or `@prisma/client@6.x` must either upgrade to `@prisma/client@^7.0.0` alongside this release, or pin `"@nestjs-crud/prisma": "^2.0.0"` to stay on the v2.0.x line. There is **no `v2.0-lts` dist-tag** — `latest` flips to `2.1.0` on this release. Consumers who don't pin will pull v2.1.0 on their next `npm update`.

### Migration

Full step-by-step walkthrough: [v2.1 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2.1-Migration).

---

## [2.0.1] — 2026-04-23

**Milestone:** v2.0.0 post-release hotfix.
**Branch:** `master` · **Previous:** `v2.0.0`

Single-issue hotfix addressing an install-time failure in `@nestjs-crud/mikro-orm@2.0.0`. No behavior changes in the other six packages — they are republished at `2.0.1` only to keep the fixed-version monorepo in lockstep.

### Fixed

- **`@nestjs-crud/mikro-orm` — `npm install` ETARGET.** `@mikro-orm/knex` was declared as a `^7.0.0` peer dependency, but `@mikro-orm/knex` currently has no stable `7.x` on npm (only `7.0.0-dev.*` prereleases), so every install of `@nestjs-crud/mikro-orm@2.0.0` failed with `notarget No matching version found for @mikro-orm/knex@^7.0.0`. `@mikro-orm/knex` is removed from `peerDependencies`; the adapter only uses it for `import type { QueryBuilder }` (type-only), and consumers already receive `@mikro-orm/knex` as a transitive dependency of their driver package (`@mikro-orm/postgresql`, `@mikro-orm/mysql`, …).

### Changed

- Root `knip` dev-dep bumped from `^5` to `^6` (CI knip job still warn-only).

### Deprecated

- `@nestjs-crud/mikro-orm@2.0.0` is deprecated on the registry with a pointer to `^2.0.1`. `npm update` pulls the fix automatically for consumers on `^2.0.0`.

---

## [2.0.0] — 2026-04-23

**Milestone:** Architectural Cleanup & Breaking Fixes — coordinated breaking release across 7 packages (6 existing + new `@nestjs-crud/prisma`).
**Branch:** `master` · **Previous:** `v1.0.2`

Upgrading from v1.0.2 requires consumer code changes — see the [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration). Want to stay on v1? Pin `"@nestjs-crud/<pkg>": "^1.0.2"` in your `package.json` — `npm update` will continue tracking the v1.0.x line.

```
yarn up @nestjs-crud/util@2.0.0 @nestjs-crud/request@2.0.0 @nestjs-crud/core@2.0.0 \
        @nestjs-crud/typeorm@2.0.0 @nestjs-crud/drizzle@2.0.0 @nestjs-crud/mikro-orm@2.0.0 \
        @nestjs-crud/prisma@2.0.0
```

### Breaking

- **Strict field allowlist on `?sort=`, `?filter=`, `?search=`.** Unknown fields now throw `RequestQueryException` (v1: silently skipped). Audit your consumers' query strings — `@VirtualColumn`, `@Formula`, dotted paths without explicit `join=` all break. No opt-out flag in v2.
- **`DrizzleCrudService` typed constructor.** `db: any` → `db: DrizzleClient`. Subclasses must update.
- **`MikroOrmCrudService` typed public method signatures.** Subclasses overriding `getMany`/`getOne`/etc. must conform to typed return values.
- **`ParamOption.enum` `SwaggerEnumType` inlined.** Affects only consumers who imported the internal type directly.
- **`CrudCacheNotConfiguredError` fail-fast.** `@Crud({ query: { cache } })` now throws if `DataSource({ cache: ... })` is not configured. Configure your DataSource cache OR remove the `@Crud` cache option.
- **Node `>=22.0.0` enforced** via `engines.node` in every package.json.
- **MikroORM v7 required** (peer-deps bumped from `>=6.0.0` to `^7.0.0`).
- **`strictSanitization` opt-out flag removed** (security kill-switch was inappropriate for a default-on guard).

### Changed

- **`@nestjs-crud/core` peer ranges for `class-transformer` and `class-validator` narrowed from `"*"` to `"^0.5.0"` and `"^0.14.0"` respectively.** Consumers on `class-transformer@0.5.x` or `class-validator@0.14.x` are unaffected. Consumers on older or newer 0.x lines (e.g. `class-validator@0.13.x`) now get a `npm WARN` peer warning at install time — the library has only been tested against the currently-pinned majors.
- **`@nestjs-crud/prisma` default logger parity.** `PrismaCrudService` now auto-instantiates `new Logger(PrismaCrudService.name)` from `@nestjs/common` when `serviceConfig.logger` is omitted, matching `@nestjs-crud/typeorm`, `@nestjs-crud/drizzle`, and `@nestjs-crud/mikro-orm`. Consumers who previously omitted the logger (or passed `undefined`) now see adapter-level errors logged through NestJS's configured logger by default. Source-compatible — consumer-supplied loggers are preserved unchanged.

### New Features

- **`@nestjs-crud/prisma` adapter** — new Prisma adapter ships at v2.0.0. Same conceptual surface as the other 3 services. See [ServicePrisma](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma).
- **Optional `LoggerService` ctor parameter** on TypeORM, Drizzle, MikroORM, Prisma services. See [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging).
- **`relationLoadStrategy: 'join' | 'query'` per-controller and per-request switch** (TypeORM only). Avoids Cartesian explosion on multi-OneToMany reads. See [RelationLoadStrategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy) for the alias-select divergence caveat.

### Security

- **`setAuthPersist` validates persist keys** against `entityColumnsHash`; throws `RequestQueryException` on invalid keys; logs key NAMES only (PII guard).
- **Mutation methods run inside `READ COMMITTED` transactions** across all 3 v1 adapters + Prisma. Closes the v1 read-modify-write race in `updateOne`/`replaceOne`/`deleteOne`.
- **Pre-ship audit completed** — peer-deps fixed across all 7 packages; 30 Dependabot alerts triaged.

### Performance

- **`relationLoadStrategy` switch** (above) avoids Cartesian explosion under multi-relation reads.
- **Shared `QueryTranslator.count()`** across all 3 v1 adapters.
- **Coverage gates** — per-package coverage thresholds enforced: 65% (drizzle) / 75% (mikro-orm, prisma) / 80% (typeorm).

### Swagger / OpenAPI

- **User-facing operation metadata.** `@Crud()`-generated routes now ship with imperative operation summaries (`List users`, `Get user by id`, `Create users in bulk`, ...), per-route markdown descriptions that reference supported query parameters and validation groups, outcome-focused response text (`Paginated list of matching resources`, `Resource created`, `Resource removed`), and realistic query-parameter examples (`?s=`, `?filter=`, `?sort=`, ...).
- **Consumer customization surface.** New `@Crud({ swagger: { tag, description, examples, operations, errorResponses, synthExample, tagWithVersion } })` option object lets consumers override generated text, opt in to error-response documentation, or swap the body-example synthesizer.
- **Auto `@ApiTags`.** The factory assigns `@ApiTags` using the pluralized entity name when the controller is not already tagged. Setting `swagger.tag` (string or string array) overrides the default. Setting `swagger.tagWithVersion: true` on a versioned controller (`@Controller({ version })`) prepends a `v{version}/` prefix so auto-tags do not collide across API versions.
- **Error responses documented.** `400 Bad Request` is now emitted on every generated route. `404 Not Found` is emitted on single-resource routes (`get`/`update`/`replace`/`delete`/`recover`). `401 Unauthorized` is emitted when the controller is decorated with `@CrudAuth()`; consumers who enforce authentication via a globally-registered guard (`APP_GUARD`) can force-emit it via `@Crud({ swagger: { errorResponses: { unauthorized: true } } })`.
- **Request-body examples.** Create, update, and replace routes now ship an example payload synthesized from the entity's `@ApiProperty` metadata. Set `swagger.examples: false` to opt out, or supply `swagger.synthExample: (entity, route) => payload` to take over example construction (consumer return value ships verbatim; do not include secrets).
- **Query-parameter documentation links.** Every built-in query parameter description now carries a `Docs` backlink that points at the `Query-Syntax` wiki page.
- **`Swagger.operationsMap(modelName)` return shape.** The internal helper now returns `{ summary, description }` tuples per route rather than plain summary strings. **Internal API break.** Consumers who imported this class directly (the `CrudRoutesFactory` subclass pattern documented in older wiki pages) must destructure the new shape:

  ```ts
  // before (v1.x):
  const summary = Swagger.operationsMap(this.modelName)[name];
  Swagger.setOperation({ summary, ... }, this.targetProto[name]);

  // after (v2.0.0):
  const { summary, description } = Swagger.operationsMap(this.modelName)[name];
  Swagger.setOperation({ summary, description, ... }, this.targetProto[name]);
  ```

- **`operationId` is computed, not overridable.** `@Crud({ swagger: { operations: { *: { operationId } } } })` is rejected at compile time (type-level `Omit`) and at runtime (the factory re-applies the canonical `{routeName}{ControllerName}{ModelName}` id after consumer-operations merge). OpenAPI requires `operationId` uniqueness across the full document.

### Internal

- **Adapter decomposition.** TypeORM service slimmed from 1023 → 249 lines. Drizzle service −214 lines (−35.8%). MikroORM service −196 lines (−36.6%). Each adapter now composes `WhereBuilder` + `QueryComposer` + `FetchHelper` under a shared `QueryTranslator<Q, W>` facade. See [CONTRIBUTING.md — Adapter shape](https://github.com/kodjunkie/nestjs-crud/blob/master/CONTRIBUTING.md#adapter-shape).
- **Config-object constructors at every translator/piece boundary** — no service-locator casts, no piece-to-service backrefs.
- **`integration/typeorm/` deleted**, `examples/typeorm-demo/` is the canonical demo.
- **Real-DB integration tests** for Drizzle + MikroORM + Prisma cells; CI matrix expanded to 4 adapters × 2 DBs.
- **Swagger-less CI matrix added** — verifies `safeRequire` correctness when `@nestjs/swagger` is not installed.
- **Per-package Jest configs** — each adapter package owns its `jest.config.js` (required for MikroORM ESM via `--experimental-vm-modules`).

### Migration

Full breaking-change inventory and step-by-step upgrade guidance: [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration).

**Want to stay on v1?** Pin `"@nestjs-crud/<pkg>": "^1.0.2"` in your `package.json`. There is **no `v1-lts` dist-tag** — `latest` flips to `2.0.0` on this release. Consumers who don't pin will pull v2 on their next `npm update`.

### Legal

- (No new attribution changes from v1.0.2 — `LICENSE` + `NOTICE.md` carried forward.)

### Forward-looking (v2.x / v3 work)

The following work is tracked separately and NOT promised by v2.0.0:
- Unified caching API across all 4 adapters (currently TypeORM-only).
- Unified `relationLoadStrategy` across all 4 adapters (currently TypeORM-only).
- `@zmotivat0r/mrepo` evaluation against alternatives (Nx, Turborepo).
- Drizzle / MikroORM / Prisma coverage threshold uplift to uniform 80%.

---

## [1.0.2] — 2026-04-21

**Milestone:** Security & Release Readiness — lean, strictly non-breaking patch release.
**Branch:** `v1.0.2` · **Previous:** `v1.0.1`

Upgrading from 1.0.1 requires **no consumer code changes**.

```
yarn up @nestjs-crud/*
# or
npm update @nestjs-crud/util @nestjs-crud/request @nestjs-crud/core \
           @nestjs-crud/typeorm @nestjs-crud/drizzle @nestjs-crud/mikro-orm
```

### Legal

- Upstream MIT attribution restored: `LICENSE` now preserves Michael Yali's 2018-Present copyright alongside the fork maintainer's. `NOTICE.md` added documenting fork origin (`@nestjsx/crud` at `5.0.0-alpha.3`). `contributors` arrays added to the four upstream-derived packages (`util`, `request`, `core`, `typeorm`). Sibling-consistency fix to `@nestjs-crud/mikro-orm` package manifest.

### Correctness

- **`@nestjs-crud/util`** — Removed `/g` flag from `isDateString` regex (`packages/util/src/checks.util.ts`). The flag caused stateful `.test()` `lastIndex` alternation: consecutive calls with the same input returned alternating `true`/`false`. Regression test added (three calls with the same literal verifies idempotence).

- **`@nestjs-crud/typeorm`** — Removed `/g` → `/i` flag from all four `sqlInjectionRegEx` entries (`packages/typeorm/src/typeorm-crud.service.ts`). Same `lastIndex` class of bug. The in-test regex seed at `a.typeorm-crud-service.spec.ts:9-14` updated in lockstep so regression tests prove what they claim. Repeat-call regression test added.

- **`@nestjs-crud/mikro-orm`** — Audited `sqlInjectionRegEx` at `packages/mikro-orm/src/mikro-orm-crud.service.ts`: already at parity with the Drizzle adapter (`/i`, not `/gi`). No source change; source-file inspection test added; parity comment added.

### Ergonomics

- Root `tsconfig.json` now excludes `**/lib` and `**/*.tsbuildinfo` from the TypeScript input set. This prevents TS5055 errors on back-to-back `yarn build` runs (composite project outputs were being re-read as inputs). `yarn build && yarn build` now succeeds without `yarn clean` in between. `yarn rebuild` remains documented in `CONTRIBUTING.md` for edge cases.

- `CONTRIBUTING.md` added — covers branch strategy, local setup, build commands, test commands, commit conventions (Conventional Commits → feeds Lerna CHANGELOG generation), and the `/g`-flag-on-`.test()` avoidance rule.

### CI

- `.github/workflows/tests.yml` pinned to Yarn 4.12.0 (previously `yarn set version stable` resolved to 4.14.1 whose lockfile format `version: 9` was incompatible with the repo's `yarn.lock` `version: 8`, causing `--immutable` install failures on every CI run). `packageManager: "yarn@4.12.0"` added to root `package.json` for Corepack users.

### Forward-looking (v2.0 deprecation signals)

The following surfaces carry `@deprecated` JSDoc annotations in v1.0.2, visible in consumer IDEs and in the emitted `.d.ts` declaration files. **No runtime change.** These signals give consumers months of lead time before v2.0 ships its breaking changes.

- `DrizzleCrudService` — constructor's `db: any` parameter will require a typed Drizzle client in v2.
- `MikroOrmCrudService` — class-level: public method signatures and internal `any` surfaces will tighten in v2. Field-level: `protected metadata: any` will become a typed `EntityMetadata` reference.
- `@nestjs-crud/core` — `ParamOption.enum` is typed against `@nestjs/swagger`'s internal import path; v2 will switch to the public Swagger type export.

Migration guide (placeholder — will be authored when v2 planning begins):
https://github.com/kodjunkie/nestjs-crud/wiki/v2-migration

---

## [1.0.1]

See the [v1.0.1 release](https://github.com/kodjunkie/nestjs-crud/releases/tag/v1.0.1).

---

[2.2.4]: https://github.com/kodjunkie/nestjs-crud/compare/v2.2.3...v2.2.4
[2.2.3]: https://github.com/kodjunkie/nestjs-crud/compare/v2.2.2...v2.2.3
[2.2.2]: https://github.com/kodjunkie/nestjs-crud/compare/v2.2.1...v2.2.2
[2.2.1]: https://github.com/kodjunkie/nestjs-crud/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/kodjunkie/nestjs-crud/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/kodjunkie/nestjs-crud/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/kodjunkie/nestjs-crud/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/kodjunkie/nestjs-crud/compare/v1.0.2...v2.0.0
[1.0.2]: https://github.com/kodjunkie/nestjs-crud/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/kodjunkie/nestjs-crud/releases/tag/v1.0.1
