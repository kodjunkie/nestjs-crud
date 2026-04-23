<div align="center">
  <h1>@nestjs-crud/typeorm</h1>
</div>
<div align="center">
  <strong>This package provides a CRUD service for relational databases build with TypeORM</strong>
</div>

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

## See also

- [Wiki: ServiceTypeorm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm) — full TypeORM adapter API
- [Wiki: Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching) — `@Crud({ query: { cache } })` + DataSource cache provider + `CrudCacheNotConfiguredError`
- [Wiki: RelationLoadStrategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy) — `'join'` vs `'query'` strategy + alias-select divergence (v2.0.0)
- [Wiki: Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging) — optional `LoggerService` ctor parameter (v2.0.0)
- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration)
