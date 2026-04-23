# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [Unreleased]

### Changed

- Peer-dependency ranges for `class-transformer` and `class-validator` narrowed from `"*"` to `"^0.5.0"` and `"^0.14.0"` respectively. Tested versions are `class-transformer@0.5.1` and `class-validator@0.14.3`. Consumers pinned within `^0.5.x` / `^0.14.x` are unaffected.


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
