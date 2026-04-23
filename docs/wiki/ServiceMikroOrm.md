This package provides a CRUD service for databases using MikroORM.

> The API follows the same patterns as TypeORM. See the [TypeORM service docs](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm) for full API details.

## Install

```shell
npm i @nestjs-crud/mikro-orm @mikro-orm/core @mikro-orm/knex
```

## Usage

Assume you have a MikroORM **entity**:

```typescript
import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity()
export class Company {
  @PrimaryKey()
  id!: number;

  @Property()
  name!: string;
}
```

Then create a **service**:

```typescript
import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { MikroOrmCrudService } from '@nestjs-crud/mikro-orm';

import { Company } from './company.entity';

@Injectable()
export class CompaniesService extends MikroOrmCrudService<Company> {
  constructor(private em: EntityManager) {
    super(em, Company);
  }
}
```

Then provide your service in a **controller**:

```typescript
import { Controller } from '@nestjs/common';
import { Crud, CrudController } from '@nestjs-crud/core';

import { Company } from './company.entity';
import { CompaniesService } from './companies.service';

@Crud({
  model: {
    type: Company,
  },
})
@Controller('companies')
export class CompaniesController implements CrudController<Company> {
  constructor(public service: CompaniesService) {}
}
```

## v2.0.0 notes

- **Typed public method signatures (TYPES-02 — breaking).** Public methods (`getMany`, `getOne`, `createOne`, etc.) now have typed return values instead of `any`. Subclasses overriding these methods must conform — import `CrudRequest` + `GetManyDefaultResponse` from `@nestjs-crud/core`. See [v2 Migration guide § TYPES-02](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration#3-types-02--mikroorm-typed-public-method-signatures).
- **MikroORM v7 required.** Peer-deps bumped from `>=6.0.0` to `^7.0.0` for `@mikro-orm/core` and `@mikro-orm/knex`.
- **Transactions:** `updateOne`, `replaceOne`, `deleteOne` now run inside `em.transactional(...)` wrapped in `RequestContext.create` to preserve identity-map scoping. `READ COMMITTED` isolation (SEC-03).
- **Identity-map hygiene:** the internal `FetchHelper` receives `getEm: () => EntityManager` as a thunk and calls `this.getEm()` fresh per method — never caches `em`. This preserves MikroORM's request-scope lifecycle.
- **ESM consumer caveat:** `@mikro-orm/core` v7 is pure ESM. If you import `@nestjs-crud/mikro-orm` in a CommonJS project, you may need to enable `--experimental-vm-modules` for tests, or migrate to ESM. See [CONTRIBUTING.md § MikroORM ESM caveat](https://github.com/kodjunkie/nestjs-crud/blob/master/CONTRIBUTING.md#mikroorm-esm-caveat).
- **Logging:** pass an optional `LoggerService` to the constructor's third argument (OBS-01). See [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging).

## See also

- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration)
- [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging)
- [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching)
