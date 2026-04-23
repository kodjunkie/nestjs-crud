This package provides a CRUD service for databases using Drizzle ORM.

> The API follows the same patterns as TypeORM. See the [TypeORM service docs](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm) for full API details.

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
import { DrizzleCrudService } from '@nestjs-crud/drizzle';

import { companies } from './company.table';

@Injectable()
export class CompaniesService extends DrizzleCrudService<typeof companies.$inferSelect> {
  constructor(@Inject('DB') db: any) {
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

## v2.0.0 notes

- **Typed `DrizzleClient` constructor (breaking).** The `db` parameter is now typed against the structural `DrizzleClient` interface instead of `any`. Update your subclass:

  ```typescript
  import { DrizzleCrudService, DrizzleClient } from '@nestjs-crud/drizzle';

  constructor(@Inject('DB') db: DrizzleClient) { super(db, companies); }
  ```

  See [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration#2-drizzle-drizzleclient-typed-constructor).
- **Transactions:** `updateOne`, `replaceOne`, `deleteOne` now run inside `db.transaction(...)` with `READ COMMITTED` isolation. Internally, the translator clones for the transaction via `cloneFor(tx)` — service code never calls `tx.update/insert/delete` directly.
- **Caching:** the `@Crud({ query: { cache } })` option is currently a no-op for Drizzle. Use a Redis wrapper or HTTP-cache layer above the controller. See [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching).
- **Logging:** pass an optional `LoggerService` to the constructor's third argument. See [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging).

## See also

- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration)
- [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching)
- [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging)
