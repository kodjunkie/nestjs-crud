A CRUD service for databases using Drizzle ORM.

> The API mirrors TypeORM. See [ServiceTypeorm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm) for the full API surface.

## Install

```shell
npm i @nestjs-crud/drizzle drizzle-orm
npm i pg                       # Postgres
npm i mysql2                   # MySQL
```

The DB driver is declared as an optional `peerDependency` on `@nestjs-crud/drizzle` — install whichever your backend uses.

## Usage

Start with a Drizzle **table**:

```typescript
import { pgTable, serial, varchar } from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
});
```

Create a **service**:

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

Wire it into a **controller**:

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

### Typed `DrizzleClient` constructor (breaking)

The `db` parameter is now typed against the structural `DrizzleClient` interface instead of `any`. Update your subclass:

```typescript
import { DrizzleCrudService, DrizzleClient } from '@nestjs-crud/drizzle';

constructor(@Inject('DB') db: DrizzleClient) { super(db, companies); }
```

See [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration#2-drizzle-drizzleclient-typed-constructor).

### Transactions

`updateOne`, `replaceOne`, and `deleteOne` run inside `db.transaction(...)` at `READ COMMITTED` isolation. The translator clones for the transaction via `cloneFor(tx)`; service code never calls `tx.update`, `tx.insert`, or `tx.delete` directly.

### Caching

`@Crud({ query: { cache } })` is a no-op for Drizzle. Cache at the service layer (Redis memoizer) or put an HTTP cache in front of the controller. See [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching).

### Logging

Pass an optional `LoggerService` as the constructor's third argument. See [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging).

## See also

- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration)
- [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching)
- [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging)
