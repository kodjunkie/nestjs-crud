A CRUD service for relational databases built with TypeORM.

## Install

```shell
npm i @nestjs-crud/typeorm @nestjs/typeorm typeorm
```

## Usage

Start with a TypeORM **entity**:

```typescript
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Company {
  @PrimaryGeneratedColumn() id: number;

  @Column() name: string;
}
```

Create a **service**:

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

Wire it into a **controller**:

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

### Architecture

`TypeOrmCrudService` is now a ~250-line orchestrator. Query composition lives in a shared `QueryTranslator<SelectQueryBuilder, Brackets>` facade made of `WhereBuilder + QueryComposer + FetchHelper`. There is no consumer-visible API change. Background: [CONTRIBUTING.md — Adapter shape](https://github.com/kodjunkie/nestjs-crud/blob/master/CONTRIBUTING.md#adapter-shape).

### Transactions

`updateOne`, `replaceOne`, and `deleteOne` run inside a `QueryRunner` transaction at `READ COMMITTED` isolation. This closes the v1 read-modify-write race.

### Cache wiring

`@Crud({ query: { cache } })` requires a `DataSource({ cache: ... })` provider. Without one, the first cached read throws `CrudCacheNotConfiguredError`. See [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching).

### Relation loading

Opt into the `'query'` strategy with `@Crud({ query: { relationLoadStrategy: 'query' } })` to avoid Cartesian explosion when you read multiple `OneToMany` relations on the same parent. See [RelationLoadStrategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy).

### Logging

Pass an optional `LoggerService` as the constructor's second argument. See [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging).

### Field allowlist

Unknown sort, filter, or search fields throw `RequestQueryException`. See the [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration#1-strict-field-allowlist-on-sortfiltersearch).

## See also

- [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching)
- [Relation load strategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy)
- [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging)
- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration)
