<div align="center">
  <h1>@nestjs-crud/core</h1>
</div>
<div align="center">
  <strong>Auto-generated RESTful CRUD endpoints for NestJS controllers — adapter-agnostic core</strong>
</div>

## Install

```shell
npm i @nestjs-crud/core class-transformer class-validator
```

You also need ONE of the adapter packages: `@nestjs-crud/typeorm`, `@nestjs-crud/drizzle`, `@nestjs-crud/mikro-orm`, or `@nestjs-crud/prisma`.

## Usage

`@nestjs-crud/core` provides the framework primitives:

- **`@Crud()` decorator** — class-level on a controller; auto-generates 8 RESTful routes (`getMany`, `getOne`, `createOne`, `createMany`, `updateOne`, `replaceOne`, `deleteOne`, `recoverOne`).
- **`@Override()`, `@ParsedRequest()`** — method/parameter decorators for customizing generated routes.
- **`CrudConfigService`** — global defaults for query parsing, response shape, validation groups.
- **`CrudCacheNotConfiguredError`** (new in v2.0.0) — thrown when `@Crud({ query: { cache } })` is set without a `DataSource` cache provider (TypeORM only).

```typescript
import { Controller } from '@nestjs/common';
import { Crud, CrudController } from '@nestjs-crud/core';
import { TypeOrmCrudService } from '@nestjs-crud/typeorm';
import { Company } from './company.entity';

@Crud({ model: { type: Company } })
@Controller('companies')
export class CompaniesController implements CrudController<Company> {
  constructor(public service: TypeOrmCrudService<Company>) {}
}
```

## See also

- [Wiki: Controllers](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers) — full `@Crud()` options + Swagger + validation
- [Wiki: Requests](https://github.com/kodjunkie/nestjs-crud/wiki/Requests) — query-string syntax
- [Wiki: Services](https://github.com/kodjunkie/nestjs-crud/wiki/Services) — adapter overview
- [Wiki: Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching) — cache wiring + `CrudCacheNotConfiguredError`
- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration)
