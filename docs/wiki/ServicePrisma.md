This package provides a CRUD service for relational databases built with [Prisma](https://www.prisma.io/).

> **New in v2.0.0.** The API follows the same patterns as TypeORM. See the [TypeORM service docs](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm) for the conceptual overview.

## Install

```shell
npm i @nestjs-crud/prisma '@prisma/client@^7'
npm i -D 'prisma@^7'
```

(The single quotes keep `zsh` from expanding `^7` as a glob.)

You also need a Prisma schema and a generated client. If you're new to Prisma, follow the [Prisma getting-started guide](https://www.prisma.io/docs/getting-started) to set up `schema.prisma` and run `npx prisma generate` before continuing.

## Connection options

`@nestjs-crud/prisma` is pattern-agnostic — the adapter accepts any `PrismaClient` instance. On Prisma 7, though, how you build that client is the interesting part: the `datasources` / `datasourceUrl` constructor options and the schema-level `url` property are gone. The only non-Accelerate connection path is a **driver adapter** (`@prisma/adapter-pg`, `@prisma/adapter-mariadb`, `@prisma/adapter-planetscale`, `@prisma/adapter-neon`, `@prisma/adapter-d1`, etc.).

### Driver adapter (required on Prisma 7+)

Install the adapter package that matches your database alongside its driver:

```shell
# Postgres
npm i @prisma/adapter-pg pg

# MySQL / MariaDB
npm i @prisma/adapter-mariadb
```

Wire it through a `PrismaClient` factory in a Nest module:

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

export const PRISMA_CLIENT = Symbol('PRISMA_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: PRISMA_CLIENT,
      useFactory: () => {
        const pool = new Pool({ connectionString: process.env.DATABASE_URL });
        const adapter = new PrismaPg(pool);
        return new PrismaClient({ adapter });
      },
    },
  ],
  exports: [PRISMA_CLIENT],
})
export class PrismaModule {}
```

MySQL / MariaDB uses the same pattern with `PrismaMariaDb`, which accepts the connection URL directly:

```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL!);
const prisma = new PrismaClient({ adapter });
```

Swap in `@prisma/adapter-planetscale`, `@prisma/adapter-neon`, `@prisma/adapter-d1`, etc. depending on where you deploy — the rest of the factory is identical.

> **Postgres non-`public` schema users.** `@prisma/adapter-pg` does not run `SET search_path` on pooled connections. If your app lives in a non-`public` schema (multi-tenant, per-env schema, etc.), `$executeRawUnsafe` / `$queryRawUnsafe` calls will not find your tables. Work around it by passing libpq `options` in the `pg` PoolConfig so every pooled connection sets `search_path` on startup:
>
> ```typescript
> const pool = new Pool({
>   connectionString: process.env.DATABASE_URL,
>   options: '-c search_path=my_schema',
> });
> const adapter = new PrismaPg(pool, { schema: 'my_schema' });
> ```

> **MySQL raw-SQL users.** `@prisma/adapter-mariadb` dispatches each `$executeRawUnsafe` / `$queryRawUnsafe` call on a fresh pooled connection. Session-scoped state (`SET FOREIGN_KEY_CHECKS = 0`, `SET SESSION sql_mode = ...`, timezone overrides) does not persist across calls — bundle any required setup into the same statement, or use `$transaction` so all calls share a connection.

### Schema file (Prisma 7)

Prisma 7 removes `datasource.url` from `schema.prisma` — the datasource block declares the provider only:

```prisma
datasource db {
  provider = "postgresql"
}

generator client {
  provider = "prisma-client-js"
}
```

If you run `prisma migrate` or `prisma db push`, create a `prisma.config.ts` next to `schema.prisma` that forwards `DATABASE_URL` for the CLI — see the [Prisma 7 `prisma.config.ts` reference](https://www.prisma.io/docs/orm/reference/prisma-config-reference). `@nestjs-crud/prisma` itself never reads `schema.prisma`; only the Prisma CLI does.

### Upgrading from `@nestjs-crud/prisma@2.0.x`?

See the [v2.1 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2.1-Migration) for the full walkthrough: schema rewrite, `prisma.config.ts` setup, driver-adapter install, and the PrismaClient ctor changes.

## Usage

The examples below assume you've wired `PrismaClient` per the [Connection options](#connection-options) section above.

Assume you have a Prisma **model** in your `schema.prisma`:

```prisma
model Company {
  id    Int    @id @default(autoincrement())
  name  String
}
```

Run `npx prisma generate` to produce the typed client, then wire `PrismaClient` through the `PrismaModule` shown in [Connection options](#connection-options) above so it can be injected via the `PRISMA_CLIENT` token.

Then create a **service** that extends `PrismaCrudService`. Unlike TypeORM (which infers everything from `@Entity` metadata) or MikroORM (which inspects the `EntityManager`), Prisma's generated client carries no runtime metadata about columns or relations — so the adapter takes a config object that declares them explicitly:

```typescript
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaCrudService } from '@nestjs-crud/prisma';
import { PrismaJoinResolver } from '@nestjs-crud/prisma';

import { PRISMA_CLIENT } from './prisma.module';

@Injectable()
export class CompaniesService extends PrismaCrudService<Record<string, unknown>> {
  constructor(@Inject(PRISMA_CLIENT) prisma: any) {
    const joinResolver = new PrismaJoinResolver({
      relationFields: [],
      allowedColumnsByRelation: {},
    });

    super(prisma, 'company', {
      entityColumns: ['id', 'name'],
      entityPrimaryColumns: ['id'],
      entityHasDeleteColumn: false,
      softDeleteColumn: null,
      onBadRequest: (msg: string) => {
        throw new BadRequestException(msg);
      },
      joinResolver,
    });
  }
}
```

The constructor takes three arguments:

1. **`prisma`** — the `PrismaClient` instance (or anything matching `PrismaClientLike`).
2. **`modelName`** — the Prisma delegate name. This is the lowercase form of the model name as it appears on `PrismaClient`. For `model Company { ... }` you pass `'company'` (because the delegate is `prisma.company`).
3. **`config`** — a `PrismaCrudServiceConfig<T>` object that declares the model's columns, primary keys, soft-delete column (or `null`), the bad-request thrower, and a `PrismaJoinResolver` for relation traversal.

Then provide your service in a **controller**:

```typescript
import { Controller } from '@nestjs/common';
import { Crud } from '@nestjs-crud/core';

import { CompaniesService } from './companies.service';

@Crud({
  model: {
    type: Object, // Prisma generated types are TS interfaces, not classes
  },
})
@Controller('companies')
export class CompaniesController {
  constructor(public service: CompaniesService) {}
}
```

Because Prisma's generated types are TypeScript **interfaces** (not classes), use `model: { type: Object }` in `@Crud()`. Body validation should be handled with dedicated `class-validator` DTO classes wired through `@Crud({ dto: { create, update, replace } })` — see the [TypeORM service docs](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm) for the DTO pattern.

## v2.0.0 notes

- **Transactions.** All mutation methods (`updateOne`, `replaceOne`, `deleteOne`) run inside `prisma.$transaction(..., { isolationLevel: 'ReadCommitted' })`. The translator is cloned for the transaction client (`translator.cloneFor(tx)`), so the read-modify-write window that affected v1 is closed. `createMany` uses Prisma's array-form `$transaction([...])` to return full records (Prisma's native `createMany` returns `{ count }` only).
- **Joins use `include`, not SQL JOIN.** Prisma's `include` / nested-`select` translates `@Crud({ query: { join } })`, but the semantics are **not identical** to SQL JOINs — Prisma issues separate queries per relation by default. For relation-heavy reads, prefer explicit `include` configuration over `@Crud` join wiring. The `PrismaJoinResolver` enforces a SQLi mitigation for dotted-path sort by validating the relation chain against the schema's allowed columns.
- **Logger.** When `serviceConfig.logger` is omitted the service defaults to `new Logger(PrismaCrudService.name)` from `@nestjs/common` — matching the other adapters. Pass a custom `logger` on the config to capture adapter-level errors in your own sink:
  ```typescript
  super(prisma, 'company', {
    /* ...other config... */
    logger: { error: (msg, trace) => myLogger.error(msg, trace) },
  });
  ```
  See the [Logging guide](https://github.com/kodjunkie/nestjs-crud/wiki/Logging).
- **Caching.** The `@Crud({ query: { cache } })` option is currently a **no-op** for the Prisma adapter — see the [Caching guide](https://github.com/kodjunkie/nestjs-crud/wiki/Caching). Use [Prisma Accelerate](https://www.prisma.io/docs/accelerate) or a Redis memoization wrapper at the application layer.
- **Soft delete.** Set `entityHasDeleteColumn: true` and `softDeleteColumn: 'deletedAt'` (or whatever your column is named) to enable `recoverOne` and the `softDelete` route option. Without these the deletion always hard-deletes.

## See also

- [Caching guide](https://github.com/kodjunkie/nestjs-crud/wiki/Caching)
- [Logging guide](https://github.com/kodjunkie/nestjs-crud/wiki/Logging)
- [Relation load strategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy)
- [v2.1 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2.1-Migration)
- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration)
- [Prisma docs](https://www.prisma.io/docs)
