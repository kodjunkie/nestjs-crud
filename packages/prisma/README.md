<div align="center">
  <h1>@nestjs-crud/prisma</h1>
</div>
<div align="center">
  <strong>This package provides a CRUD service for relational databases built with Prisma.</strong>
</div>

> **New in v2.0.0.** The API follows the same patterns as TypeORM. See the [Prisma service docs](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma) for full Prisma adapter API.

## Install

```shell
npm i @nestjs-crud/prisma @prisma/client
npm i -D prisma
```

## Usage

Assume you have a Prisma **model** in your `schema.prisma`:

```prisma
model Company {
  id    Int    @id @default(autoincrement())
  name  String
}
```

Run `npx prisma generate`, expose a `PrismaClient` provider, then create a **service**. Unlike TypeORM/MikroORM, Prisma generated types are not classes, so `PrismaCrudService` requires an explicit column manifest plus a `PrismaJoinResolver` for relation fields:

```typescript
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaCrudService, PrismaJoinResolver } from '@nestjs-crud/prisma';
import type { Company, PrismaClient } from '@prisma/client';

@Injectable()
export class CompaniesService extends PrismaCrudService<Company> {
  constructor(@Inject('PRISMA_CLIENT') prisma: PrismaClient) {
    super(prisma, 'company', {
      entityColumns: ['id', 'name'],
      entityPrimaryColumns: ['id'],
      entityHasDeleteColumn: false,
      softDeleteColumn: null,
      onBadRequest: (msg) => {
        throw new BadRequestException(msg);
      },
      joinResolver: new PrismaJoinResolver({
        relationFields: [],
        allowedColumnsByRelation: {},
      }),
    });
  }
}
```

Then provide your service in a **controller**:

```typescript
import { Controller } from '@nestjs/common';
import { Crud } from '@nestjs-crud/core';

import { CompaniesService } from './companies.service';

class CompanyModel {
  id!: number;

  name!: string;
}

@Crud({
  model: { type: CompanyModel },
})
@Controller('companies')
export class CompaniesController {
  constructor(public service: CompaniesService) {}
}
```

## See also

- [Wiki: ServicePrisma](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma) — full Prisma adapter API
- [Wiki: Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging) — optional `LoggerService` on `serviceConfig.logger` (v2.0.0); defaults to `new Logger(PrismaCrudService.name)` when omitted
- [Wiki: Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching) — `@Crud({ query: { cache } })` honored via `PrismaRedisCacheStrategy` or `PrismaAccelerateCacheStrategy` (v2.2.0+)
- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration)
