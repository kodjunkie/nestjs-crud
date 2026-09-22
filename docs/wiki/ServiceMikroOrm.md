A CRUD service for databases using MikroORM.

> The API mirrors TypeORM. See [ServiceTypeorm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm) for the full API surface.

> MikroORM 7 declares its own Node floor, `>=22.17.0`, higher than this project's own `>=22.12.0`. Installing on exactly 22.12.0 can print an advisory `EBADENGINE` warning naming `@mikro-orm/core` or `@mikro-orm/sql`; it is informational, not a failure.

## Install

```shell
npm i @nestjs-crud/mikro-orm @mikro-orm/core @mikro-orm/sql
npm i @mikro-orm/postgresql pg # Postgres
npm i @mikro-orm/mysql mysql2  # MySQL
```

The DB driver is declared as an optional `peerDependency` on `@nestjs-crud/mikro-orm` — install whichever your backend uses, alongside the matching `@mikro-orm/<dialect>` package.

## Usage

Start with a MikroORM **entity**:

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

Create a **service**:

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

### Typed public method signatures (breaking)

`getMany`, `getOne`, `createOne`, and friends now return typed values instead of `any`. Subclasses overriding these must conform: import `CrudRequest` and `GetManyDefaultResponse` from `@nestjs-crud/core`. See [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration#3-mikroorm-typed-public-method-signatures).

### MikroORM v7 required

Peer-deps moved from `>=6.0.0` to `^7.0.0` for `@mikro-orm/core` and `@mikro-orm/sql`.

### Transactions

`updateOne`, `replaceOne`, and `deleteOne` run inside `em.transactional(...)` wrapped in `RequestContext.create` so identity-map scoping survives the transaction. `READ COMMITTED` isolation.

### Identity-map hygiene

The internal `FetchHelper` receives `getEm: () => EntityManager` as a thunk and calls `this.getEm()` fresh on every method. It never caches `em`. This keeps MikroORM's request-scope lifecycle intact across transaction boundaries.

### ESM consumer caveat

`@mikro-orm/core` v7 is pure ESM. If you import `@nestjs-crud/mikro-orm` from a CommonJS project, you may need `--experimental-vm-modules` for tests, or you may want to migrate to ESM. See [CONTRIBUTING.md § MikroORM ESM caveat](https://github.com/kodjunkie/nestjs-crud/blob/master/CONTRIBUTING.md#mikroorm-esm-caveat).

### Logging

Pass an optional `LoggerService` as the constructor's third argument. See [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging).

### Nested joins

The adapter enforces the same nested-join ancestor rule as the other three adapters (`400 Invalid join: '<field>'` when a nested join's parent is neither requested nor eager), but it does not load nested relations — a valid nested join is accepted, and only its top-level relation is populated.

## Using EntityRepository (recommended for @mikro-orm/nestjs users)

The `MikroOrmCrudService<T>` constructor accepts either an `EntityManager` or an `EntityRepository<T>`. Consumers using `@mikro-orm/nestjs`'s `@InjectRepository(User)` injection pattern can pass the repository directly:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';

import { MikroOrmCrudService } from '@nestjs-crud/mikro-orm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService extends MikroOrmCrudService<User> {
  constructor(@InjectRepository(User) usersRepo: EntityRepository<User>) {
    super(usersRepo, User);
  }
}
```

Internally, the library unwraps the repository via `repo.getEntityManager()`, which returns the same ALS-backed `EntityManager` proxy that `@mikro-orm/nestjs` injects. Request-scope identity-map isolation is preserved — no behavior change vs the EntityManager-direct constructor.

The `EntityManager` form continues to work for consumers not using `@mikro-orm/nestjs`:

```typescript
constructor(em: EntityManager) {
  super(em, User);
}
```

> **MikroORM-only:** This constructor union is specific to the MikroORM adapter. The TypeORM adapter expects `Repository<T>`, the Drizzle adapter expects a `DrizzleClient`-shaped object, and the Prisma adapter expects a `PrismaClient` — none of those signatures change.

## See also

- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration)
- [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging)
- [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching)
