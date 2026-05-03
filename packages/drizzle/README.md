<div align="center">
  <h1>@nestjs-crud/drizzle</h1>
</div>
<div align="center">
  <strong>This package provides a CRUD service for databases using Drizzle ORM.</strong>
</div>

> The API follows the same patterns as TypeORM. See the [Drizzle service docs](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceDrizzle) for full Drizzle adapter API.

## Install

```shell
npm i @nestjs-crud/drizzle drizzle-orm
```

## Usage

Assume you have a Drizzle **table** definition:

```typescript
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
});
```

Then create a **service**:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { DrizzleCrudService, DrizzleClient } from '@nestjs-crud/drizzle';

import { companies } from './company.table';

@Injectable()
export class CompaniesService extends DrizzleCrudService<typeof companies.$inferSelect> {
  constructor(@Inject('DB') db: DrizzleClient) {
    super(db, companies);
  }
}
```

Then provide your service in a **controller**:

```typescript
import { Controller } from '@nestjs/common';
import { Crud, CrudController } from '@nestjs-crud/core';

import { CompaniesService } from './companies.service';

@Crud({
  model: {
    type: Object, // Drizzle uses plain objects, not class entities
  },
})
@Controller('companies')
export class CompaniesController {
  constructor(public service: CompaniesService) {}
}
```

## See also

- [Wiki: ServiceDrizzle](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceDrizzle) — full Drizzle adapter API
- [Wiki: Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging) — optional `LoggerService` constructor parameter (v2.0.0)
- [Wiki: Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching) — `@Crud({ query: { cache } })` honored via `DrizzleCacheStrategy` (v2.2.0+)
- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration) — including the typed `DrizzleClient` constructor migration
