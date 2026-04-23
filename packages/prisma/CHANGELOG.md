# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [2.0.0](https://github.com/kodjunkie/nestjs-crud/releases/tag/v2.0.0) (2026-04-23)

Initial release. `@nestjs-crud/prisma` ships at v2.0.0 — same conceptual surface as the other adapters (`@nestjs-crud/typeorm`, `@nestjs-crud/drizzle`, `@nestjs-crud/mikro-orm`).

See the [root CHANGELOG.md](../../CHANGELOG.md#200--2026-04-23), the [ServicePrisma wiki page](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma), and the [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration) for full details.


### Features

* **ADAPTER-01:** `PrismaCrudService<T>` — translates parsed CRUD requests into Prisma client operations.
* **ARCH-01..05:** Composes `WhereBuilder` + `QueryComposer` + `FetchHelper` under shared `QueryTranslator` facade (same shape as the other adapters).
* **OBS-01:** Optional `LoggerService` ctor parameter.


### Security

* **SEC-03:** Mutation methods (`updateOne`/`replaceOne`/`deleteOne`) run inside `READ COMMITTED` transactions.


### Internal

* **engines:** Node `>=22.0.0` enforced (BUILD-01).
* Real-DB integration tests cover Postgres + MySQL (CI-02 / PARITY-03).
