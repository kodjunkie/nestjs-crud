<h1 align="center">
  <img src="img/logo.svg" alt="nestjs-crud" height="56" />
</h1>

<p align="center">
  <strong>RESTful APIs for NestJS — from a single <code>@Crud()</code> decorator</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@nestjs-crud/core"><img src="https://img.shields.io/npm/v/@nestjs-crud/core.svg" alt="npm version" /></a>
  <a href="https://github.com/kodjunkie/nestjs-crud/actions/workflows/tests.yml"><img src="https://github.com/kodjunkie/nestjs-crud/actions/workflows/tests.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
</p>

<br />

Eight RESTful endpoints for any NestJS controller: list, paginate, filter, sort, join, nested-join, soft-delete, recover. Zero handlers to write.

## Features

<img align="right" src="img/crud-usage.png" alt="A NestJS service and controller using @Crud()" width="380" />

- CRUD controllers and services you extend, not scaffolds you own
- DB and service agnostic. Base classes per adapter
- Query parsing: filters, pagination, sort, relations, nested relations, cache
- Pluggable cache: Redis, ioredis, Prisma Accelerate, or bring your own via `RedisLike`
- Framework-agnostic query builder for the frontend
- Body, query, and path-param validation included
- Override any generated handler with `@Override()`
- Small config. Per-controller or global defaults
- Swagger docs auto-wired (optional peer)

## Quick start

```bash
npm install @nestjs-crud/core @nestjs-crud/typeorm
```

```ts
@Crud({
  model: { type: User },
  query: { limit: 25, maxLimit: 100, join: { profile: { eager: true } } },
})
@Controller('users')
export class UsersController {
  constructor(public service: UsersService) {}
}
```

You get `GET /users`, `GET /users/:id`, `POST /users`, `POST /users/bulk`, `PATCH /users/:id`, `PUT /users/:id`, `DELETE /users/:id`, and `POST /users/:id/recover`. Each route ships with query parsing, validation, and pagination built in. Swagger appears automatically when `@nestjs/swagger` is installed.

## Adapters

| Adapter  | Package                                                                          | Docs                                                                             |
| -------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| TypeORM  | [`@nestjs-crud/typeorm`](https://www.npmjs.com/package/@nestjs-crud/typeorm)     | [ServiceTypeorm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm)   |
| Drizzle  | [`@nestjs-crud/drizzle`](https://www.npmjs.com/package/@nestjs-crud/drizzle)     | [ServiceDrizzle](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceDrizzle)   |
| MikroORM | [`@nestjs-crud/mikro-orm`](https://www.npmjs.com/package/@nestjs-crud/mikro-orm) | [ServiceMikroOrm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceMikroOrm) |
| Prisma   | [`@nestjs-crud/prisma`](https://www.npmjs.com/package/@nestjs-crud/prisma)       | [ServicePrisma](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma)     |

Plus [`@nestjs-crud/core`](https://www.npmjs.com/package/@nestjs-crud/core) (decorator + framework, see [Controllers](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers)) and [`@nestjs-crud/request`](https://www.npmjs.com/package/@nestjs-crud/request) (frontend query builder, see [Requests](https://github.com/kodjunkie/nestjs-crud/wiki/Requests)).

## Versions

- **v2.x** (current): released on npm as `@nestjs-crud/*@2.x`, active development on `master`. Adds the Prisma adapter, a shared `QueryTranslator` core, tighter types, and real-DB integration tests.
- **v1.0.x** (maintenance): drop-in replacement for [`@nestjsx/crud`](https://github.com/nestjsx/crud). Same API, modernized dependencies, security patches, runs on NestJS 11. Moving off the base library? Install `@nestjs-crud/*@1.0.x` and you're done, no code changes. Browse the [`v1.0.2`](https://github.com/kodjunkie/nestjs-crud/tree/v1.0.2) tag or branch. Backports land there only if needed.

Moving off `@nestjsx/crud`? Step first to `@nestjs-crud/*@1.0.x` (same API, zero code changes), then decide whether to take the breaking-change upgrade to `@nestjs-crud/*@2.x` via the [v1 → v2 guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration). Already on v2.0? The [v2.0 → v2.1 guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2.1-Migration) covers the Prisma-v7 consumer migration.

## Documentation

Full docs live on the [**Wiki**](https://github.com/kodjunkie/nestjs-crud/wiki). Main sections:

- [Why nestjs-crud](https://github.com/kodjunkie/nestjs-crud/wiki#why)
- [Controllers](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers) · [Services](https://github.com/kodjunkie/nestjs-crud/wiki/Services) · [Requests](https://github.com/kodjunkie/nestjs-crud/wiki/Requests) · [Query syntax](https://github.com/kodjunkie/nestjs-crud/wiki/Query-Syntax)
- [Swagger setup](https://github.com/kodjunkie/nestjs-crud/wiki/Swagger) · [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching) · [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging) · [Relation load strategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy) · [Pagination (offset, cursor)](https://github.com/kodjunkie/nestjs-crud/wiki/CursorPagination)
- Migration guides: [v1 → v2](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration) · [v2.0 → v2.1](https://github.com/kodjunkie/nestjs-crud/wiki/v2.1-Migration)

## Skills

Three agent skills ship alongside the library:

| Skill                   | Scope                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `nestjs-crud`           | Current v2.x: setup, adapters, `@Crud()` options, Swagger customization, transactions, common issues |
| `nestjs-crud-v1`        | Legacy v1.0.x behavior reference                                                                     |
| `nestjs-crud-migration` | v1 → v2 upgrade playbook: audit greps, error-to-fix mapping                                          |

```bash
# all three
npx skills add kodjunkie/nestjs-crud

# one at a time
npx skills add kodjunkie/nestjs-crud -s nestjs-crud
npx skills add kodjunkie/nestjs-crud -s nestjs-crud-migration
```

## Credits

Built on the work of [Michael Yali](https://twitter.com/MichaelYali) and the [`@nestjsx/crud` contributors](https://github.com/nestjsx/crud/graphs/contributors). Fork point: upstream `5.0.0-alpha.3`. See [`NOTICE.md`](NOTICE.md) for the full fork history.

## License

[MIT](LICENSE). The upstream author's 2018-Present copyright and the fork maintainer's 2026-Present copyright both apply. Keep both notices intact if you fork.
