# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [Unreleased]

### Fixed

- **Subpath exports added to published tarball (affects 2.2.0–2.2.2):** `@nestjs-crud/core/cache`, `@nestjs-crud/core/cursor`, and `@nestjs-crud/core/query` now resolve from the published npm package via an `exports` map. Previously these subpaths failed with `ERR_PACKAGE_PATH_NOT_EXPORTED` or `MODULE_NOT_FOUND` in consumers. The previously-required `@nestjs-crud/core/lib/cache`, `/lib/cursor`, and `/lib/query` workaround paths continue to resolve via an explicit `./lib/*` wildcard passthrough — existing consumers do not need to change their imports.
- **Internal declaration cleanup:** Core type declarations previously referenced `@nestjs-crud/request`'s internal library path (`@nestjs-crud/request/lib/types/request-query.types`) in emitted `.d.ts` files. The three affected core source files now import from the `@nestjs-crud/request` package root, so emitted declarations reference only the public API surface of the request package.
- **Swagger metadata restored for `@nestjs/swagger` 11.4.3+:** A package `exports` map added in recent upstream versions blocked the internal `./dist/constants` deep-require that core used to read `DECORATORS` metadata keys. All four swagger helpers silently fell into the no-swagger degradation path, stripping OpenAPI operation, parameter, response, and tag annotations from every generated CRUD route. Core now consolidates `DECORATORS` resolution in a single module: the deep-require is attempted first and still wins on versions whose exports map allows it; when the path is blocked but `@nestjs/swagger` is installed, stable inlined key strings are used as a fallback. The no-swagger graceful-degradation path is unchanged.

## [2.2.2] — 2026-05-19

Version-only republish — no package-specific source changes. Bumped in lockstep with the rest of the monorepo. See the [root CHANGELOG.md](../../CHANGELOG.md#222--2026-05-19) for full release details (security: 5 dependabot advisories closed; runtime dep refresh; optional driver peers on adapters).


## [2.2.1] — 2026-05-03

Version-only republish — no package-specific source changes. Bumped in lockstep with the rest of the monorepo. See the [root CHANGELOG.md](../../CHANGELOG.md#221--2026-05-03) for full release details.


## [2.2.0] — 2026-05-03

### Added

- Cursor pagination support: new `@nestjs-crud/core/cursor` subpath exporting `CursorCodec`, `CursorPayload`, and the `CursorPaginatedResponse<T>` response type. New `pagination: 'offset' | 'cursor'` knob on `CrudOptions` and `QueryOptions` (default `'offset'` — non-breaking). New required `applyCursor(query, decoded, sort)` method on the `QueryComposer<Q>` and `QueryTranslator<Q,W>` interfaces; all four bundled adapters implement it. Cursor codec performs a 1024-character length check before base64 decode (DoS guard), and any payload deviation throws `BadRequestException('Invalid cursor')`.
- `@Crud({ serviceProperty })` decorator option to configure the controller field that holds the CrudService. Default `'service'` preserves existing behavior; consumers can name their field `usersService`, `customerService`, etc., without violating the `CrudController<T>` contract. Reserved keys (`'__proto__'`, `'constructor'`, `'prototype'`) are rejected at decoration time to prevent prototype-pollution shapes. A clear error is thrown at request time if the configured property is undefined on the controller instance.
- `CrudController<T>.service` is now optional. Consumers using `serviceProperty` to declare a custom field name no longer need to provide a `service` field to satisfy the interface contract. Existing `implements CrudController<T>` consumers continue to compile unchanged.
- `CacheStrategy` interface (`wrap`, `get`, `set`, `invalidate`) at `@nestjs-crud/core/cache`. All `ttl` arguments are uniformly in milliseconds across the contract.
- `MockCacheStrategy` — `Map`-backed in-memory implementation for tests. Uses `Date.now()` expiry checks (no `setTimeout` leaks under jest) and provides single-flight de-duplication: concurrent `wrap()` calls for the same key invoke `fetchFn` exactly once.
- `buildCacheKey(entityName, parsed)` utility — deterministic SHA-1 fingerprint of the parsed request. Same logical inputs produce the same key regardless of object key insertion order; different `authPersist` values produce different keys (multi-tenant isolation; PII safety — plaintext auth context never appears in cache keys).
- `CrudConfigService.config.query.cacheStrategy` field for global wiring.
- `CrudConfigService.config.query.cacheErrorPolicy` field plus exported `CacheErrorPolicy` union type (`'fail-fast' | 'fallback-to-source'`, default `'fail-fast'`) — controls behavior when `cacheStrategy.wrap()` rejects.
- `CrudConfigService.reset()` static method to restore the default config (test ergonomics).
- `CrudCacheNotConfiguredError` message generalized: now references both `CrudConfigService.load` and constructor wiring paths, plus the legacy `DataSource.cache` fallback for TypeORM consumers. Class shape unchanged (still extends `Error`, name preserved); backward-compatible.
- `RequestQueryParser` now surfaces `?cache=0` / `?cache=1` / `?cache=true` / `?cache=false` as a boolean on `parsed.options.cache` (alongside the existing numeric `parsed.cache` TTL-override field). Adapter `FetchHelper` implementations consume the boolean to decide whether to bypass the cache wrap. Unrecognized values silent-ignore (treats as if absent — preserves backward-compat).

### Changed

- Added `RedisLike` interface and `toRedisLike()` / `isRedisLike()` adapter utilities to `@nestjs-crud/core/cache`. Auto-detects node-redis v5 vs ioredis client shape; lazy-once auto-connect deduplicates concurrent first-op connect calls to a single `client.connect()`. Custom backends can implement the four `RedisLike` methods directly.
- Peer-dependency ranges for `class-transformer` and `class-validator` narrowed from `"*"` to `"^0.5.0"` and `"^0.14.0"` respectively. Tested versions are `class-transformer@0.5.1` and `class-validator@0.14.3`. Consumers pinned within `^0.5.x` / `^0.14.x` are unaffected.

### Removed

- Removed the unwired `CrudActions.DeleteAll` enum value (`'Delete-All'`). Pre-v2 holdover — no `deleteAllBase` route exists in `BaseRouteName` and `CrudRoutesFactory.actionsMap` never mapped it, so `getAction(handler)` on any generated route never returned it. The corresponding entry in `CrudResponseInterceptor`'s `actionToDtoNameMap` is also removed (the mapped type now requires only the 8 wired actions). Consumers with `case CrudActions.DeleteAll:` in exhaustive `switch (action)` ACL blocks should drop the case; runtime behavior unchanged.


## [2.1.1]

### Added

- `@nestjs/swagger` declared as an optional peerDependency (`^10.0.0 || ^11.0.0`).

### Removed

- Removed undocumented internal helpers `getSwaggerVersion` and `swaggerPkgJson`. They gated a `@nestjs/swagger` v3 compatibility path that has been unreachable since the package's peer floor moved to v10. The dropped path also included the `ApiModelProperty` fallback in the `ApiProperty` helper.


## [2.0.0](https://github.com/kodjunkie/nestjs-crud/compare/v1.0.2...v2.0.0) (2026-04-23)

Coordinated v2.0.0 milestone release. See the [root CHANGELOG.md](../../CHANGELOG.md#200--2026-04-23) and the [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration) for full breaking-change details.


### Breaking

* **query:** Strict field allowlist on `?sort=`, `?filter=`, `?search=` — unknown fields now throw `RequestQueryException` (v1: silently skipped). No opt-out flag.
* **types:** `ParamOption.enum` `SwaggerEnumType` inlined.
* **cache:** New `CrudCacheNotConfiguredError` thrown when `@Crud({ query: { cache } })` is set but `DataSource({ cache: ... })` is not configured.
* **sanitization:** Removed `strictSanitization` opt-out flag.
* **swagger:** `Swagger.operationsMap(modelName)` now returns `{ summary, description }` tuples instead of plain summary strings. Consumers who subclass `CrudRoutesFactory` and call `operationsMap` directly must destructure the new shape. `operationId` in `@Crud({ swagger: { operations: { *: { operationId } } } })` is rejected at compile time — it is computed per-route to preserve OpenAPI uniqueness.


### Features

* **query:** Shared `QueryTranslator<Q, W>` facade contract published from `@nestjs-crud/core/query` subpath (internal API for adapter authors).
* **swagger:** Imperative operation summaries and per-route markdown descriptions on every `@Crud()`-generated route. Response text is outcome-focused and references the named response DTO. Error responses are now documented: `400` on every route, `404` on single-resource routes, `401` when `@CrudAuth()` is present or `errorResponses.unauthorized: true` is set. Query parameters carry realistic examples and `Query-Syntax` wiki backlinks.
* **swagger:** New `@Crud({ swagger: { tag, description, examples, operations, errorResponses, synthExample, tagWithVersion } })` consumer customization surface. Auto `@ApiTags` with pluralized entity name; `tagWithVersion: true` prepends `v{version}/` on versioned controllers. Consumer `synthExample` function takes precedence over `@ApiProperty` introspection for request-body examples.


### Security

* **auth:** `setAuthPersist` validates persist keys against `entityColumnsHash`; throws `RequestQueryException` on invalid keys; logs key NAMES only (PII guard).


### Internal

* **engines:** Node `>=22.0.0` enforced.


## [1.0.2](https://github.com/kodjunkie/nestjs-crud/compare/v1.0.1...v1.0.2) (2026-04-20)


### Bug Fixes

* **legal:** restore upstream attribution and refresh branding ([b0b9da6](https://github.com/kodjunkie/nestjs-crud/commit/b0b9da67aee4772e77dfbc7bd76f8aae201a8ee2))
