## Why?

[NestJS](https://github.com/nestjs/nest) gives you modules, DI, and a clean request pipeline. What it doesn't give you is the eight CRUD endpoints every REST API writes from scratch: list, paginate, filter, sort, join, nested-join, soft-delete, recover. So you keep writing the same query-parse + DB-translate glue for every resource.

`nestjs-crud` writes those eight endpoints from one `@Crud()` decorator. It handles query parsing (`?filter=`, `?sort=`, `?join=`, `?page=`), validation, pagination, soft-delete, and Swagger docs. Plug in your entity and a service that extends one of the ORM adapters (TypeORM, Drizzle, MikroORM, or Prisma). Need custom behavior on one route? Drop `@Override()` on your handler and keep the other seven generated.

Forked from [`@nestjsx/crud`](https://github.com/nestjsx/crud). Modernized dependencies, regular releases, same API on v1.0.x (drop-in for existing `@nestjsx/crud` consumers), and an opt-in v2.x when you want the cleanup. Upgrade path: [Versions](https://github.com/kodjunkie/nestjs-crud#versions).

## Packages

nestjs-crud ships as a Yarn workspaces monorepo. Four adapters, plus the core framework, the request builder, and a shared util:

- [**@nestjs-crud/core**](https://www.npmjs.com/package/@nestjs-crud/core) — `@Crud()` decorator, global config, validation, helper decorators ([Controllers](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers))
- [**@nestjs-crud/request**](https://www.npmjs.com/package/@nestjs-crud/request) — `RequestQueryBuilder` for the frontend, `RequestQueryParser` for the backend ([Requests](https://github.com/kodjunkie/nestjs-crud/wiki/Requests))
- [**@nestjs-crud/typeorm**](https://www.npmjs.com/package/@nestjs-crud/typeorm) — `TypeOrmCrudService` base class ([ServiceTypeorm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm))
- [**@nestjs-crud/drizzle**](https://www.npmjs.com/package/@nestjs-crud/drizzle) — `DrizzleCrudService` base class ([ServiceDrizzle](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceDrizzle))
- [**@nestjs-crud/mikro-orm**](https://www.npmjs.com/package/@nestjs-crud/mikro-orm) — `MikroOrmCrudService` base class ([ServiceMikroOrm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceMikroOrm))
- [**@nestjs-crud/prisma**](https://www.npmjs.com/package/@nestjs-crud/prisma) — `PrismaCrudService` base class, new in v2.0.0 ([ServicePrisma](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma))
- [**@nestjs-crud/util**](https://www.npmjs.com/package/@nestjs-crud/util) — internal shared helpers (you won't install this directly)

## Guides

- [Controllers](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers) — `@Crud()` options, overrides, auth, validation
- [Services](https://github.com/kodjunkie/nestjs-crud/wiki/Services) — base service contract shared across adapters
- [Requests](https://github.com/kodjunkie/nestjs-crud/wiki/Requests) · [Query syntax](https://github.com/kodjunkie/nestjs-crud/wiki/Query-Syntax) — how parsed requests and frontend queries work
- [Swagger](https://github.com/kodjunkie/nestjs-crud/wiki/Swagger) — setup and full `@Crud({ swagger: {...} })` customization
- [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching) · [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging) · [Relation load strategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy)

## Migration

- [v1 → v2](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration) — breaking changes across all adapters
- [v2.0 → v2.1](https://github.com/kodjunkie/nestjs-crud/wiki/v2.1-Migration) — Prisma v7 consumer upgrade (driver adapter required)

## Clone and run tests

```shell
git clone https://github.com/kodjunkie/nestjs-crud
cd nestjs-crud
docker compose up -d
yarn install
yarn build
yarn test
```

`docker compose` brings up Postgres on port 5455, MySQL on 3316, and Redis on 6399 for integration runs.

## Run the example project

```shell
yarn db:prepare:typeorm:postgres
yarn start:typeorm
```

Open `http://localhost:3000/docs` for Swagger. The source lives at [`examples/typeorm-demo/`](https://github.com/kodjunkie/nestjs-crud/tree/master/examples/typeorm-demo) — a standalone NestJS app you can copy from.
