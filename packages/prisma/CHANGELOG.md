# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [Unreleased]

_(No unreleased changes.)_

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
