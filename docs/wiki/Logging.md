# Logging

`@nestjs-crud` adapter services accept an optional NestJS `LoggerService` instance via the constructor (OBS-01, new in v2.0.0). Pass a logger to gain visibility into SQLi-guard rejections, transaction lifecycle, and mutation errors — without forcing a logger on consumers who don't need one.

## Which adapters support it

All four adapter services ship the OBS-01 optional logger hook:

- `TypeOrmCrudService` (Phase 8)
- `DrizzleCrudService` (Phase 8)
- `MikroOrmCrudService` (Phase 8)
- `PrismaCrudService` (Phase 9 — exposed via `serviceConfig.logger`, see "Prisma differences" below)

If you omit the logger, the TypeORM / Drizzle / MikroORM services default to a private `new Logger(<ServiceName>)` instance from `@nestjs/common` — meaning they always log at NestJS's configured level. Pass `new Logger(MyService.name)` (or your custom `LoggerService`) explicitly when you want logs scoped to your service name. The Prisma service treats the logger as fully optional — when omitted, all log calls are no-ops.

## Wiring (TypeORM, Drizzle, MikroORM)

Pass any object that satisfies the NestJS `LoggerService` interface (`log`, `warn`, `error`, optional `debug`, optional `verbose`). The default `Logger` from `@nestjs/common` is the obvious choice; custom loggers (Pino-Nest, Winston-Nest, etc.) work the same way.

### TypeORM

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmCrudService } from '@nestjs-crud/typeorm';
import { Repository } from 'typeorm';

import { Company } from './company.entity';

@Injectable()
export class CompaniesService extends TypeOrmCrudService<Company> {
  constructor(@InjectRepository(Company) repo: Repository<Company>) {
    super(repo, new Logger(CompaniesService.name)); // logger is the 2nd ctor arg
  }
}
```

### Drizzle

```typescript
super(db, companies, relationsConfig, new Logger(CompaniesService.name)); // 4th arg
```

### MikroORM

```typescript
super(em, Company, new Logger(CompaniesService.name)); // 3rd arg
```

In every case the logger is the **last** constructor parameter and is fully optional.

## Prisma differences

The Prisma adapter exposes the logger through its `serviceConfig` object rather than as a separate ctor argument, and uses a structurally narrower contract (only `error` is required; `warn` and `debug` are optional):

```typescript
import { PrismaCrudService } from '@nestjs-crud/prisma';

@Injectable()
export class CompaniesService extends PrismaCrudService<Company> {
  constructor(prisma: PrismaService) {
    super(prisma, 'company', {
      // ...other PrismaCrudServiceConfig fields (entityColumnsHash, etc.)
      logger: new Logger(CompaniesService.name),
    });
  }
}
```

Any object shaped `{ error, warn?, debug? }` satisfies the contract — including the NestJS `Logger`, Pino, or your own structured logger.

## What gets logged

### SQLi guard rejections (`warn`)

When a request asks the service to sort or filter by a column that isn't in the entity column allowlist, the underlying `QueryComposer` invokes `onBadRequest(...)`. Before throwing `BadRequestException`, the service emits:

```
[CompaniesService] SQLi guard rejected field: Invalid sort field 'password; DROP TABLE users'
```

This is your audit trail for attempted column-injection attacks via `?sort=` or `?filter=`. The 400 response is what the client sees; the warn-level log is what your SOC sees.

### Initialization (`debug`)

On service construction, each adapter emits one debug-level breadcrumb confirming the entity / table it bound to:

```
[CompaniesService] CrudService initialized: Company
```

Use this to verify per-request-scoped providers are instantiating as expected.

### Transaction lifecycle (SEC-03 — `debug` + `error`)

`updateOne`, `replaceOne`, and `deleteOne` wrap their read-modify-write sequence in a `READ COMMITTED` transaction (SEC-03 race fix). The TypeORM adapter logs commit at `debug`:

```
[CompaniesService] Transaction [updateOne] committed
```

All three core adapters log mutation failures at `error`. The Prisma adapter logs every CRUD verb's failure at `error` via the same path:

```
[CompaniesService] CrudService [updateOne] failed: QueryFailedError
```

Note what's **missing** from the message: the original error message. That's intentional — see PII guard below.

### PII guard (D-08-SEC-02)

DB drivers (TypeORM, Drizzle, mikro-orm-postgres, Prisma) surface the failing SQL **with bound parameter values** in `err.message`. Logging that string would write user-supplied PII (emails, names, tokens) into your log infrastructure.

Per the Phase 8 D-08-SEC-02 rule, the OBS-01 logger calls are constructed to log **names only — never values**:

- Mutation error logs use `err.name` in the message (e.g., `QueryFailedError`) and pass `err.stack` as the `LoggerService` second argument. The driver-supplied `err.message` (which contains parameter values) is never written to the log.
- The SQLi-guard warn logs the **rejected field name** the request tried to use, not the value the field was being compared to.

If you replace the default logger with your own implementation, preserve this discipline: callers always pass `err.name` + `err.stack`, never `err.message` or the dto being saved.

## Rotating the logger per request

The logger is captured at construction time (per service instance). For per-request loggers (e.g., a request-scoped pino child logger carrying a request ID), wrap the service in a `Scope.REQUEST` provider — that's a NestJS DI pattern, not a `@nestjs-crud` concern.

Be aware: with MikroORM, request-scoped providers also affect `EntityManager` resolution. The MikroORM adapter already uses a `() => this.em` thunk to stay request-scope-correct (T-06-02); request-scoping the service is compatible with that design.

## Disabling individual log levels

`@nestjs-crud` does NOT add level-control — it just calls `logger.warn(...)`, `logger.debug?.(...)`, etc. To silence specific levels:

- **NestJS default `Logger`:** configure `app.useLogger(['error', 'warn'])` in `bootstrap()`, or call `Logger.overrideLogger([...])`.
- **Custom logger:** use whatever level configuration your logger provides (Pino's `level`, Winston's transport levels, etc.).

The service code calls `this.logger.debug?.(...)` (optional chaining) so loggers without a `debug` method don't error.

## See also

- NestJS Logger docs: https://docs.nestjs.com/techniques/logger
- [Service: TypeORM](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm)
- [Service: Drizzle](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceDrizzle)
- [Service: MikroORM](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceMikroOrm)
- [Service: Prisma](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma)
- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-migration)
