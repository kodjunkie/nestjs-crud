# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

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
