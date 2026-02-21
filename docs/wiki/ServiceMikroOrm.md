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
