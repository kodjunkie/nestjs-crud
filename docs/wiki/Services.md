# Services

`@nestjs-crud/*` provides 4 adapter services — one per supported ORM. All extend the `CrudService` abstract base from `@nestjs-crud/core` and follow the same `WhereBuilder + QueryComposer + FetchHelper` shape (see [CONTRIBUTING.md — Adapter shape](https://github.com/kodjunkie/nestjs-crud/blob/master/CONTRIBUTING.md#adapter-shape)).

## ORM matrix

| ORM | Service class | Wiki page | Cache option | Logger hook |
|-----|---------------|-----------|--------------|-------------|
| TypeORM | `TypeOrmCrudService` | [ServiceTypeorm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm) | ✓ via DataSource cache | ✓ |
| Drizzle | `DrizzleCrudService` | [ServiceDrizzle](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceDrizzle) | consumer-owned (see Caching) | ✓ |
| MikroORM | `MikroOrmCrudService` | [ServiceMikroOrm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceMikroOrm) | consumer-owned (Result Cache) | ✓ |
| Prisma | `PrismaCrudService` | [ServicePrisma](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma) | consumer-owned (Accelerate) | ✓ |

All 4 services support:

- The 8 generated routes from `@Crud()`
- `@Override()` to replace generated handlers
- Field allowlist (strict in v2.0.0 — unknown sort/filter/search fields throw `RequestQueryException`)
- READ COMMITTED transaction wrapping for mutation methods
- Optional `LoggerService` constructor injection (see [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging))

## Choosing an adapter

- **TypeORM** — most mature ecosystem, full feature parity with v1; pick for greenfield Postgres / MySQL projects with class entities.
- **Drizzle** — light, SQL-first; pick for type-safety and bundle-size focus.
- **MikroORM** — Unit-of-Work + identity map; pick if you want active-record-style ergonomics.
- **Prisma** — schema-first + generated client; pick if your team is already invested in the Prisma toolchain.

## See also

- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration)
- [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching)
- [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging)
- [Relation load strategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy)
