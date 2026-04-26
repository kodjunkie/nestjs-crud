# Services

`@nestjs-crud/*` ships four adapter services, one per supported ORM. They all extend `CrudService` from `@nestjs-crud/core` and follow the same `WhereBuilder + QueryComposer + FetchHelper` shape (see [CONTRIBUTING.md — Adapter shape](https://github.com/kodjunkie/nestjs-crud/blob/master/CONTRIBUTING.md#adapter-shape)).

## ORM matrix

| ORM | Service class | Wiki page | `@Crud cache` | Logger hook |
|-----|---------------|-----------|---------------|-------------|
| TypeORM | `TypeOrmCrudService` | [ServiceTypeorm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm) | wired through DataSource cache | yes |
| Drizzle | `DrizzleCrudService` | [ServiceDrizzle](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceDrizzle) | not wired (cache at the service layer) | yes |
| MikroORM | `MikroOrmCrudService` | [ServiceMikroOrm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceMikroOrm) | not wired (use Result Cache) | yes |
| Prisma | `PrismaCrudService` | [ServicePrisma](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma) | not wired (use Accelerate) | yes |

See [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching) for the cache option details.

All four services give you:

- The eight generated routes from `@Crud()`
- `@Override()` for replacing any generated handler
- A strict field allowlist (v2.0.0): unknown sort, filter, or search fields throw `RequestQueryException`
- `READ COMMITTED` transactions wrapping `updateOne`, `replaceOne`, and `deleteOne`
- An optional `LoggerService` constructor argument (see [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging))

## Choosing an adapter

- **TypeORM**: most mature ecosystem, full feature parity with v1. The default for greenfield Postgres or MySQL projects with class entities.
- **Drizzle**: SQL-first and light, good when you care about type safety and bundle size.
- **MikroORM**: Unit-of-Work + identity map; reach for it if active-record ergonomics suit your team.
- **Prisma**: schema-first with a generated client. Pick this if you are already on the Prisma toolchain.

## See also

- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration)
- [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching)
- [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging)
- [Relation load strategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy)
