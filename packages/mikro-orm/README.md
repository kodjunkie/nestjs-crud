<div align="center">
  <h1>@nestjs-crud/mikro-orm</h1>
</div>
<div align="center">
  <strong>This package provides a CRUD service for databases using MikroORM.</strong>
</div>

> The API follows the same patterns as TypeORM. See the [MikroORM service docs](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceMikroOrm) for full MikroORM adapter API.

> **Node 22+ required.** This package depends on `@mikro-orm/core ^7.0.0` (peer-dep, bumped in v2.0.0 from v6) which uses pure ESM. Run tests via `yarn test:mikro-orm` only — bare `npx jest packages/mikro-orm/test/...` fails with `SyntaxError: Cannot use 'import.meta' outside a module`. See [CONTRIBUTING.md](https://github.com/kodjunkie/nestjs-crud/blob/master/CONTRIBUTING.md#mikroorm-esm-caveat) for the full ESM caveat.

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

## See also

- [Wiki: ServiceMikroOrm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceMikroOrm) — full MikroORM adapter API
- [Wiki: Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging) — optional `LoggerService` ctor parameter (v2.0.0)
- [Wiki: Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching) — current state for MikroORM (consumer-owned)
- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration) — including the typed public method signatures migration
