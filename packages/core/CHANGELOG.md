# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.0.0](https://github.com/kodjunkie/nestjs-crud/compare/v1.0.2...v2.0.0) (2026-04-23)

Coordinated v2.0.0 milestone release. See the [root CHANGELOG.md](../../CHANGELOG.md#200--2026-04-23) and the [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration) for full breaking-change details.


### Breaking

* **query:** Strict field allowlist on `?sort=`, `?filter=`, `?search=` — unknown fields now throw `RequestQueryException` (v1: silently skipped). No opt-out flag.
* **types:** `ParamOption.enum` `SwaggerEnumType` inlined.
* **cache:** New `CrudCacheNotConfiguredError` thrown when `@Crud({ query: { cache } })` is set but `DataSource({ cache: ... })` is not configured.
* **sanitization:** Removed `strictSanitization` opt-out flag.


### Features

* **query:** Shared `QueryTranslator<Q, W>` facade contract published from `@nestjs-crud/core/query` subpath (internal API for adapter authors).


### Security

* **auth:** `setAuthPersist` validates persist keys against `entityColumnsHash`; throws `RequestQueryException` on invalid keys; logs key NAMES only (PII guard).


### Internal

* **engines:** Node `>=22.0.0` enforced.


## [1.0.2](https://github.com/kodjunkie/nestjs-crud/compare/v1.0.1...v1.0.2) (2026-04-20)


### Bug Fixes

* **legal:** restore upstream attribution and refresh branding ([b0b9da6](https://github.com/kodjunkie/nestjs-crud/commit/b0b9da67aee4772e77dfbc7bd76f8aae201a8ee2))
