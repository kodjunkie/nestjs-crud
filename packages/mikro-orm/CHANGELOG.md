# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.0.0](https://github.com/kodjunkie/nestjs-crud/compare/v1.0.2...v2.0.0) (2026-04-23)

Coordinated v2.0.0 milestone release. See the [root CHANGELOG.md](../../CHANGELOG.md#200--2026-04-23) and the [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration) for full breaking-change details.


### Breaking

* **TYPES-02:** Public method signatures (`getMany`/`getOne`/etc.) and internal `any` surfaces tightened. Subclasses overriding these methods must conform to typed return values.
* **MikroORM v7 required** — peer-deps bumped from `>=6.0.0` to `^7.0.0`.
* **ARCH-03:** Strict field allowlist on `?sort=`, `?filter=`, `?search=` — unknown fields now throw `RequestQueryException`.


### Features

* **ARCH-01..05:** Service decomposed (-196 lines, -36.6%). Composes `WhereBuilder` + `QueryComposer` + `FetchHelper` under shared `QueryTranslator` facade.
* **OBS-01:** Optional `LoggerService` ctor parameter.


### Security

* **SEC-03:** Mutation methods now run inside `READ COMMITTED` transactions.


### Internal

* `MikroOrmFetchHelper` receives `getEm: () => EntityManager` thunk instead of caching `em`. Prevents cross-request identity-map pollution.
* **engines:** Node `>=22.0.0` enforced (BUILD-01).


## [1.0.2](https://github.com/kodjunkie/nestjs-crud/compare/v1.0.1...v1.0.2) (2026-04-20)


### Bug Fixes

* **legal:** restore upstream attribution and refresh branding ([b0b9da6](https://github.com/kodjunkie/nestjs-crud/commit/b0b9da67aee4772e77dfbc7bd76f8aae201a8ee2))
