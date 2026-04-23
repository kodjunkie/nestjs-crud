This package provides a CRUD service for relational databases build with TypeORM

## Install

```shell
npm i @nestjs-crud/typeorm @nestjs/typeorm typeorm
```

## Usage

Assume you have some TypeORM **enitity**:

```typescript
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Company {
  @PrimaryGeneratedColumn() id: number;

  @Column() name: string;
}
```

Then you need to create a **service**:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmCrudService } from '@nestjs-crud/typeorm';

import { Company } from './company.entity';

@Injectable()
export class CompaniesService extends TypeOrmCrudService<Company> {
  constructor(@InjectRepository(Company) repo) {
    super(repo);
  }
}
```

After that you need to provide your service in a **controller**:

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

- **Architecture:** `TypeOrmCrudService` is now a ~250-line orchestrator that delegates query composition to a shared `QueryTranslator<SelectQueryBuilder, Brackets>` facade (composed of `WhereBuilder` + `QueryComposer` + `FetchHelper`). No consumer-visible API change. See [CONTRIBUTING.md — Adapter shape](https://github.com/kodjunkie/nestjs-crud/blob/master/CONTRIBUTING.md#adapter-shape).
- **Transactions:** `updateOne`, `replaceOne`, `deleteOne` now run inside a `QueryRunner` transaction with `READ COMMITTED` isolation. Closes the v1 read-modify-write race.
- **Cache wiring:** `@Crud({ query: { cache } })` requires a `DataSource({ cache: ... })` provider; otherwise the request fails with `CrudCacheNotConfiguredError`. See [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching).
- **Relation loading:** opt into the `'query'` strategy via `@Crud({ query: { relationLoadStrategy: 'query' } })` to avoid Cartesian explosion on multi-OneToMany reads. See [RelationLoadStrategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy).
- **Logging:** pass an optional `LoggerService` instance to the constructor's second argument. See [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging).
- **Field allowlist:** unknown sort/filter/search fields now throw `RequestQueryException` (see [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration#1-strict-field-allowlist-on-sortfiltersearch)).

## See also

- [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching)
- [Relation load strategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy)
- [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging)
- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration)
