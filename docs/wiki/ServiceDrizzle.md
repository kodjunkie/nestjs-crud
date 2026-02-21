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
