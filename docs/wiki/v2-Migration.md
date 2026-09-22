# v2 Migration guide

`@nestjs-crud` v2.0.0 brings architectural cleanup, type tightening, security fixes and a new Prisma adapter. This guide takes you from v1.0.2 to v2.

## TL;DR

- **One coordinated breaking release.** All 7 packages published v2.0.0 together.
- **Most consumers need two changes:** make every sort/filter/search field pass the new strict allowlist, and wire a cache backend if you use `@Crud({ query: { cache } })`.
- **Drizzle and MikroORM consumers need one more change each:** typed constructor or method signatures.
- **New: Prisma adapter** (`@nestjs-crud/prisma`). See [ServicePrisma](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma).

> **Staying on v1?** Pin `"@nestjs-crud/<pkg>": "^1.0.2"` in your `package.json` and `npm update` keeps tracking the v1.0.x line. A critical bugfix would ship as v1.0.3. The v1 line stays available.

## Prerequisites

Before upgrading:

- **Node.js >=22.0.0.** Every `package.json` declares it in `engines.node`. Yarn or npm on Node <22 warns, or fails with `--engine-strict`.
- **Peer-dependency ranges at v2.0.0.** Later releases widened some of these; the [CHANGELOG](https://github.com/kodjunkie/nestjs-crud/blob/master/CHANGELOG.md) lists the current ranges.
  - `@nestjs/common`: `^10.0.0 || ^11.0.0` (all 4 adapter packages)
  - `@nestjs/typeorm`: `^10.0.0 || ^11.0.0` (typeorm package only)
  - `typeorm`: `^0.3.0` (typeorm package, same as v1)
  - `drizzle-orm`: `>=0.45.2` (drizzle package; the bump closes the GHSA-rqvj-q4hg-7v6c SQL injection)
  - `@mikro-orm/core` and `@mikro-orm/sql`: `^7.0.0` (mikro-orm package; the bump from v6 closes GHSA-77w7-9cgx-2c6w and GHSA-942q-cgq2-jp5q)
  - `@prisma/client`: `>=5.0.0` (prisma package, new in v2)

## High-blast breaking changes

Each section below shows a before/after block.

### 1. Strict field allowlist on sort/filter/search

Every consumer meets this one. v1 skipped unknown fields in `?sort=`, `?filter=` and `?search=` without an error. v2 answers them with HTTP 400 while it parses the request.

Before (v1.0.2):

```typescript
// Request: GET /users?sort=nonExistentField,ASC
// v1: no error, no log; rows come back in no particular order
// (v1 drops the `nonExistentField` token before it reaches the query builder)
```

After (v2.0.0), TypeORM adapter:

```typescript
// Request: GET /users?sort=nonExistentField,ASC
// v2: 400 Bad Request
// {
//   "statusCode": 400,
//   "message": "Invalid sort field: 'nonExistentField'",
//   "error": "Bad Request"
// }
```

The message wording varies by adapter and by query param.

Migration: make every field in `?sort=`, `?filter=` or `?search=` one of:

1. A direct column in the entity's column metadata (`@Column()`, `@PrimaryColumn()`, `@PrimaryGeneratedColumn()` and so on)
2. A relation declared in `@Crud({ query: { join } })` and referenced as `relation.field` in the request

Common v1 breakages that now surface:

- **`@VirtualColumn` and `@Formula`**: TypeORM leaves virtual columns out of the standard column metadata that the SQLi guard reads. To filter on them, override `protected entityColumnsHash` in your CrudService subclass. `@Crud({ query: { exclude | allow } })` narrows the SELECT projection; it adds no keys to the SQLi-guard allowlist.
- **Client aliases for joined subquery results**: if clients sent `?sort=clientAlias` where `clientAlias` named a SELECT alias from a custom query builder override, v2 rejects it. Send the underlying column name, or extend the allowlist through the override hook.
- **Dotted paths like `?sort=profile.name` when `profile` isn't joined**: declare the relation in the controller's `@Crud({ query: { join: { profile: {} } } })` block. v1 fell through and applied no order.

v2 has no opt-out flag. It drops the v1 `strictSanitization: false` escape hatch, because a permanent kill-switch on a security control would undercut the guard.

### 2. Drizzle `DrizzleClient` typed constructor

The `DrizzleCrudService` constructor now types its `db` parameter as the structural `DrizzleClient` interface instead of `any`, so the compiler catches a wrong drizzle instance.

Before (v1.0.2):

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { DrizzleCrudService } from '@nestjs-crud/drizzle';
import { companies } from './company.table';

@Injectable()
export class CompaniesService extends DrizzleCrudService<typeof companies.$inferSelect> {
  constructor(@Inject('DB') db: any) { // ← `any`
    super(db, companies);
  }
}
```

After (v2.0.0):

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { DrizzleCrudService, DrizzleClient } from '@nestjs-crud/drizzle';
import { companies } from './company.table';

@Injectable()
export class CompaniesService extends DrizzleCrudService<typeof companies.$inferSelect> {
  constructor(@Inject('DB') db: DrizzleClient) { // ← typed
    super(db, companies);
  }
}
```

Migration: import `DrizzleClient` from `@nestjs-crud/drizzle` and replace `db: any` in your subclass constructor. If your subclass gives `this.db` its own type, widen or cast it. `DrizzleClient` covers what the adapter needs: `select`, `insert`, `update`, `delete`, `transaction`.

### 3. MikroORM typed public method signatures

`MikroOrmCrudService` now types its public CRUD methods (`getMany`, `getOne`, `createOne`, `createMany`, `updateOne`, `replaceOne`, `deleteOne`, `recoverOne`). Overrides must match these signatures; an `any`-typed override fails to compile.

Before (v1.0.2):

```typescript
import { Injectable } from '@nestjs/common';
import { MikroOrmCrudService } from '@nestjs-crud/mikro-orm';
import { Company } from './company.entity';

@Injectable()
export class CompaniesService extends MikroOrmCrudService<Company> {
  // v1: any-typed signatures; anything compiled
  async getMany(req: any): Promise<any> {
    const result = await super.getMany(req);
    return { ...result, customField: 'foo' };
  }
}
```

After (v2.0.0):

```typescript
import { Injectable } from '@nestjs/common';
import { MikroOrmCrudService } from '@nestjs-crud/mikro-orm';
import { CrudRequest, GetManyDefaultResponse } from '@nestjs-crud/core';
import { Company } from './company.entity';

@Injectable()
export class CompaniesService extends MikroOrmCrudService<Company> {
  // v2: typed CrudRequest in, GetManyDefaultResponse<Company> | Company[] out
  async getMany(req: CrudRequest): Promise<GetManyDefaultResponse<Company> | Company[]> {
    const result = await super.getMany(req);
    return result;
  }
}
```

Migration: import the typed surfaces from `@nestjs-crud/core` (`CrudRequest`, `GetManyDefaultResponse`, `CreateManyDto` and others) and update your override signatures. If you don't override these methods, you have nothing to change.

### 4. Cache misconfiguration fail-fast

If you set `@Crud({ query: { cache } })` without a cache backend, v2 throws `CrudCacheNotConfiguredError` on the first cached request. v1 surfaced the same mistake as a generic 500.

Before (v1.0.2):

```typescript
@Crud({ model: { type: User }, query: { cache: 5000 } })
@Controller('users')
export class UsersController { /* ... */ }

// DataSource created without `cache: { ... }`
// v1: cached requests fail with a generic 500 from TypeORM, hard to trace
```

After (v2.2.0+), verbatim error message:

```text
@Crud cache option requires a CacheStrategy. Configure via CrudConfigService.load({ query: { cacheStrategy } }) or pass a strategy to the CrudService constructor. For TypeORM, the legacy DataSource.cache provider is also accepted as a fallback.
```

v2.0.x and v2.1.x worded the message around `DataSource({ cache })`, the only backend before v2.2.0.

Migration: wire a `CacheStrategy` through `CrudConfigService.load({ query: { cacheStrategy } })` or a CrudService constructor (v2.2.0+, see the [Caching guide](https://github.com/kodjunkie/nestjs-crud/wiki/Caching)), configure a TypeORM `DataSource` cache, or remove `cache` from `@Crud({ query: ... })`.

`CrudCacheNotConfiguredError` extends plain `Error`, not a NestJS `HttpException`. A cache misconfig is a developer or deployment error, and you should see it at the first cached query instead of behind a generic 500.

## Low-blast changes

Most consumers won't notice these behavior changes. Each item names its source file or wiki page.

- **`setAuthPersist` validates persist keys.** The signature gains optional params: `setAuthPersist(persist, entityColumnsHash?, logger?)`. It throws `RequestQueryException` on keys that aren't entity columns. Calls without the new params behave as before. (Source: `packages/request/src/request-query.parser.ts`.)
- **Mutation methods run inside transactions.** `updateOne`, `replaceOne` and `deleteOne` wrap their read-modify-write in a `READ COMMITTED` transaction on all 4 adapters (TypeORM `QueryRunner`, Drizzle `db.transaction`, MikroORM `em.transactional`, Prisma `$transaction`). That closes the v1 read-modify-write race. You'll notice only if you relied on the old non-atomic behavior.
- **`relationLoadStrategy: 'query'` opt-in (TypeORM only).** A new per-controller and per-request switch. If you opt in, read the [RelationLoadStrategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy) page for the alias-select caveat. (Source: `packages/typeorm/src/query/typeorm-query-composer.ts`.)
- **Inline `SwaggerEnumType`.** `packages/core/src/interfaces/params-options.interface.ts` now inlines the type instead of importing it from an internal `@nestjs/swagger` path. You see a change only if you imported that internal type.
- **Node >=22 enforced.** All 7 packages declare `engines.node >=22.0.0`; see [Prerequisites](#prerequisites).

## New features

- **Prisma adapter.** `@nestjs-crud/prisma` ships at v2.0.0 with the same surface as the other 3 adapter services. See [ServicePrisma](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma).
- **Optional logger hook.** Pass a NestJS `LoggerService` to an adapter service (Prisma takes it as `serviceConfig.logger`) to see auth-persist validation, transaction lifecycle, SQLi-guard rejections and cache misconfig. See [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging).
- **TypeORM `relationLoadStrategy`.** Switch per controller or per request between `'join'` (the default JOIN-based eager loads) and `'query'` (split queries that avoid Cartesian explosion on multi-collection eager loads). See [RelationLoadStrategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy).
- **Architectural decomposition.** Each adapter service now runs about 250 lines instead of one 1023-line monolith, built from `WhereBuilder` + `QueryComposer` + `FetchHelper` pieces behind a `QueryTranslator<Q, W>` facade. Consumers see no API change. See [CONTRIBUTING.md](https://github.com/kodjunkie/nestjs-crud/blob/master/CONTRIBUTING.md).

## Removed v1 surfaces

v1.0.2 planned `@deprecated` JSDoc on every removed surface. The v2 decomposition restructured those surfaces away, so a deprecation window had nothing left to mark. The removed surfaces:

- `DrizzleCrudService` `db: any` → typed `DrizzleClient`
- `MikroOrmCrudService` `any`-typed public method signatures → typed
- `ParamOption.enum` `SwaggerEnumType` internal import path → inlined
- `strictSanitization` opt-out flag on `@Crud({ query })` → removed (a default-on security guard shouldn't ship a kill-switch)
- v1 monolithic `TypeOrmCrudService` internals (`createBuilder`, `getSelect`, `setSearchCondition` and other protected methods) → moved to internal `WhereBuilder` / `QueryComposer` / `FetchHelper` pieces under `QueryTranslator`. If your subclass overrode these protected methods to customize query building, compose a custom `QueryTranslator` instead. [CONTRIBUTING.md](https://github.com/kodjunkie/nestjs-crud/blob/master/CONTRIBUTING.md) describes the adapter-shape contract.

## Known gaps

v2.0.0 left these open for later releases:

- **Unified caching API across all 4 adapters.** v2.0.0 wired `@Crud({ query: { cache } })` for TypeORM only. v2.2.0 shipped the unified `CacheStrategy`; see [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching).
- **Unified `relationLoadStrategy` across all 4 adapters.** The switch stays TypeORM-only; the other adapters already load relations with split queries.
- **MikroORM v6 dropped.** v2 peer deps require `@mikro-orm/core ^7.0.0`. If you're on v6, upgrade MikroORM first; the upgrade closes the critical SQLi and high prototype-pollution alerts in <6.6.10.

## See also

- [ServicePrisma](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma)
- [RelationLoadStrategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy)
- [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging)
- [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching)
- [ServiceTypeorm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm)
- [ServiceDrizzle](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceDrizzle)
- [ServiceMikroOrm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceMikroOrm)
- [CONTRIBUTING.md: Adapter shape](https://github.com/kodjunkie/nestjs-crud/blob/master/CONTRIBUTING.md)
- [CHANGELOG.md: v2.0.0 entry](https://github.com/kodjunkie/nestjs-crud/blob/master/CHANGELOG.md)
