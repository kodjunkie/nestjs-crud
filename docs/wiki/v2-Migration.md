# v2 Migration guide

`@nestjs-crud` v2.0.0 ships architectural cleanup, type tightening, security fixes, and the new Prisma adapter. This guide covers everything a consumer needs to upgrade from v1.0.2.

## TL;DR

- **One coordinated breaking release.** All 7 packages publish at v2.0.0 simultaneously.
- **Most consumers need TWO changes:** (1) audit field allowlists for the new strict allowlist on sort/filter/search, (2) configure your DataSource cache if you use `@Crud({ query: { cache } })`.
- **Drizzle / MikroORM consumers need ONE more change each:** typed constructor signatures.
- **New: Prisma adapter** (`@nestjs-crud/prisma`) — see [ServicePrisma](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma).

> **Want to stay on v1?** Pin `"@nestjs-crud/<pkg>": "^1.0.2"` in your `package.json` — `npm update` will continue tracking the v1.0.x line. v1.0.3 will land here if a critical bugfix is ever needed. The v1 line is preserved indefinitely.

## Prerequisites

Before upgrading:

- **Node.js >=22.0.0** (enforced via `engines.node` in every package.json). Yarn / npm install on Node 20 will warn (or fail with `--engine-strict`).
- **Peer-dependency ranges (v2.0.0):**
  - `@nestjs/common`: `^10.0.0 || ^11.0.0` (all 4 adapter packages — supports both Nest v10 + v11)
  - `@nestjs/typeorm`: `^10.0.0 || ^11.0.0` (typeorm package only)
  - `typeorm`: `^0.3.0` (typeorm package — unchanged from v1)
  - `drizzle-orm`: `>=0.45.2` (drizzle package — bumped to close GHSA-rqvj-q4hg-7v6c SQLi)
  - `@mikro-orm/core` + `@mikro-orm/knex`: `^7.0.0` (mikro-orm package — bumped from v6 to close GHSA-77w7-9cgx-2c6w + GHSA-942q-cgq2-jp5q)
  - `@prisma/client`: `>=5.0.0` (prisma package — new in v2)

## High-blast breaking changes

These changes affect a meaningful slice of consumers. Each section has a full before/after block.

### 1. Strict field allowlist on sort/filter/search

**Every consumer hits this.** v1 silently skipped unknown fields in `?sort=`, `?filter=`, and `?search=` query params. v2 throws `RequestQueryException` (HTTP 400) at request-parse time.

**Before (v1.0.2):**

```typescript
// Request: GET /users?sort=nonExistentField,ASC
// v1: silently ignored — no error, no log; ordered by nothing in particular
// (the `nonExistentField` token is dropped before reaching the query builder)
```

**After (v2.0.0):**

```typescript
// Request: GET /users?sort=nonExistentField,ASC
// v2: 400 Bad Request
// {
//   "statusCode": 400,
//   "message": "Invalid field name: nonExistentField",
//   "error": "Bad Request"
// }
```

**Migration:** ensure every field passed through `?sort=`, `?filter=`, or `?search=` is one of:

1. A direct column in the entity's column metadata (declared via `@Column()` / `@PrimaryColumn()` / `@PrimaryGeneratedColumn()` etc.)
2. A relation explicitly declared in `@Crud({ query: { join } })` AND referenced as `relation.field` in the request

**Common v1 breakages now surfaced:**

- **`@VirtualColumn` / `@Formula`** — these are TypeORM virtual columns. They aren't reflected in the standard column metadata that the SQLi guard reads. To allow filtering on them, declare them explicitly in your service via the `entityColumnsHash` override hook OR add them to your `@Crud({ query: { exclude } })` / `allow` config.
- **Client aliases for joined subquery results** — if you exposed `?sort=clientAlias` where `clientAlias` was a SELECT alias from a custom query builder override, v2 rejects it. Either expose the underlying column name in the request, or extend the allowlist via the override hook.
- **Dotted paths like `?sort=profile.name` when `profile` isn't joined** — v2 requires the relation to be declared in the controller's `@Crud({ query: { join: { profile: {} } } })` block. v1 silently fell through and ordered by nothing.

There is **no opt-out flag** in v2. The v1 `strictSanitization: false` escape hatch was removed — shipping a permanent kill-switch on a security control contradicts the project's security posture.

### 2. Drizzle `DrizzleClient` typed constructor

The `DrizzleCrudService` constructor's `db` parameter is now typed against the structural `DrizzleClient` interface instead of `any`. This catches a whole class of "wrong drizzle instance" bugs at compile time.

**Before (v1.0.2):**

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

**After (v2.0.0):**

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

**Migration:** import `DrizzleClient` from `@nestjs-crud/drizzle` and replace `db: any` in your subclass constructor. Subclasses that accessed `this.db` with custom typing may need to widen / cast — `DrizzleClient` is the structural minimum the adapter needs (`select` / `insert` / `update` / `delete` / `transaction`).

### 3. MikroORM typed public method signatures

The public CRUD methods on `MikroOrmCrudService` (`getMany`, `getOne`, `createOne`, `createMany`, `updateOne`, `replaceOne`, `deleteOne`, `recoverOne`) now have fully typed signatures. Subclasses overriding these methods must conform — `any`-typed overrides will fail to compile.

**Before (v1.0.2):**

```typescript
import { Injectable } from '@nestjs/common';
import { MikroOrmCrudService } from '@nestjs-crud/mikro-orm';
import { Company } from './company.entity';

@Injectable()
export class CompaniesService extends MikroOrmCrudService<Company> {
  // v1: any-typed signatures — anything compiled
  async getMany(req: any): Promise<any> {
    const result = await super.getMany(req);
    return { ...result, customField: 'foo' };
  }
}
```

**After (v2.0.0):**

```typescript
import { Injectable } from '@nestjs/common';
import { MikroOrmCrudService } from '@nestjs-crud/mikro-orm';
import { CrudRequest, GetManyDefaultResponse } from '@nestjs-crud/core';
import { Company } from './company.entity';

@Injectable()
export class CompaniesService extends MikroOrmCrudService<Company> {
  // v2 — typed CrudRequest in, GetManyDefaultResponse<Company> | Company[] out
  async getMany(req: CrudRequest): Promise<GetManyDefaultResponse<Company> | Company[]> {
    const result = await super.getMany(req);
    return result;
  }
}
```

**Migration:** import the typed surfaces from `@nestjs-crud/core` (`CrudRequest`, `GetManyDefaultResponse`, `CreateManyDto`, etc.) and update the override signatures to match. If you were not overriding these methods, no action needed.

### 4. Cache misconfiguration fail-fast

If you set `@Crud({ query: { cache } })` but did not configure `DataSource({ cache: ... })`, v2 throws `CrudCacheNotConfiguredError` on the **first cached request** instead of silently rendering as a generic 500.

**Before (v1.0.2):**

```typescript
@Crud({ model: { type: User }, query: { cache: 5000 } })
@Controller('users')
export class UsersController { /* ... */ }

// DataSource was created without `cache: { ... }`
// v1: cached requests fail with a generic 500 from TypeORM, hard to trace
```

**After (v2.0.0) — verbatim error message:**

```text
@Crud cache option requires a DataSource cache provider. Configure DataSource({ cache: { type: 'redis', ... } }) or remove the cache option from your @Crud() configuration.
```

**Migration:** either (a) configure your `DataSource` with one of the three cache options (Redis / database / in-memory — see the [Caching guide](https://github.com/kodjunkie/nestjs-crud/wiki/Caching)), OR (b) remove the `cache` field from `@Crud({ query: ... })`.

`CrudCacheNotConfiguredError` is a deliberate plain `Error` subclass — **not** a NestJS `HttpException`. Cache misconfig is a developer / deployment error surfaced at first-cached-query time; it should fail loud so the operator fixes the config, not be rendered to end users by Nest's default exception filter.

## Low-blast changes

Each one-liner below is a behavior change that's transparent to most consumers. Click through to source / wiki for details.

- **`setAuthPersist` validates persist keys.** Optional `entityColumnsHash` + `logger?` params on `setAuthPersist(persist, entityColumnsHash?, logger?)`. Throws `RequestQueryException` on invalid keys. Backward-compatible — pre-existing calls without the new params behave as before. (Source: `packages/request/src/request-query.parser.ts`.)
- **Mutation methods run inside transactions.** `updateOne`, `replaceOne`, and `deleteOne` now wrap in `READ COMMITTED` transactions across all 3 ORM adapters (TypeORM `QueryRunner`, Drizzle `db.transaction`, MikroORM `RequestContext.create`). Closes the v1 read-modify-write race. Transparent unless you relied on the pre-fix non-atomic semantics.
- **`relationLoadStrategy: 'query'` opt-in (TypeORM only).** New per-controller and per-request switch. If you opt in, see the [RelationLoadStrategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy) wiki page for the alias-select divergence caveat. (Source: `packages/typeorm/src/query/typeorm-query-composer.ts`.)
- **Inline `SwaggerEnumType`.** The internal `@nestjs/swagger` `SwaggerEnumType` import path was inlined in `packages/core/src/interfaces/params-options.interface.ts`. Affects only consumers who imported the internal type directly.
- **Node >=22 enforced.** All 7 packages declare `engines.node >=22.0.0`. Listed under [Prerequisites](#prerequisites) above.

## New features

- **Prisma adapter** — `@nestjs-crud/prisma` ships at v2.0.0. Same conceptual surface as the other 3 adapter services. See [ServicePrisma](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma).
- **Optional logger hook** — pass a NestJS `LoggerService` to any adapter service constructor for visibility into auth-persist validation, transaction lifecycle, SQLi-guard rejections, and cache misconfig. See [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging).
- **TypeORM `relationLoadStrategy`** — opt-in per-controller or per-request switch between `'join'` (default — JOIN-based eager loads) and `'query'` (split queries — eliminates Cartesian explosion on multi-collection eager loads). See [RelationLoadStrategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy).
- **Architectural decomposition** — adapter services are now ~250 lines each (down from a 1023-line monolith), composed of `WhereBuilder` + `QueryComposer` + `FetchHelper` pieces under a `QueryTranslator<Q, W>` facade. No consumer-visible API change. See [CONTRIBUTING.md](https://github.com/kodjunkie/nestjs-crud/blob/master/CONTRIBUTING.md).

## Removed v1 surfaces

The original v1.0.2 plan was to add `@deprecated` JSDoc annotations on every removed surface. In practice, the v2 architectural decomposition restructured the affected surfaces away entirely, so a deprecation-window cycle was moot. The removed surfaces are listed here for completeness:

- `DrizzleCrudService` `db: any` → typed `DrizzleClient`
- `MikroOrmCrudService` `any`-typed public method signatures → typed
- `ParamOption.enum` SwaggerEnumType internal-import-path → inlined
- `strictSanitization` opt-out flag on `@Crud({ query })` → removed (security kill-switch was inappropriate for a default-on guard)
- v1 monolithic `TypeOrmCrudService` internals (`createBuilder`, `getSelect`, `setSearchCondition`, etc., as protected methods) → moved to internal `WhereBuilder` / `QueryComposer` / `FetchHelper` pieces under `QueryTranslator`. Subclasses that overrode these protected methods to customize query building should now compose a custom `QueryTranslator` instead — see [CONTRIBUTING.md](https://github.com/kodjunkie/nestjs-crud/blob/master/CONTRIBUTING.md) for the adapter-shape contract.

## Forward-looking (v2.x / v3 work)

Tracked separately, **not** promised by v2.0.0:

- **Unified caching API across all 4 adapters** — currently `@Crud({ query: { cache } })` is wired only for TypeORM. Drizzle / MikroORM / Prisma consumers use ORM-native primitives at the application layer for now. (Tracked as v2.1+.)
- **Unified `relationLoadStrategy` across all 4 adapters** — `relationLoadStrategy` is currently TypeORM-only.
- **MikroORM v6 dropped** — v2 peer-deps require `@mikro-orm/core ^7.0.0`. v6 consumers must upgrade MikroORM first (closes the critical SQLi + high prototype-pollution alerts in <6.6.10).
- **Build orchestration evaluation** — `@zmotivat0r/mrepo` is currently used; future evaluation against Nx / Turborepo / plain `tsc -b` is internal forward-flag.

## See also

- [ServicePrisma](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma)
- [RelationLoadStrategy](https://github.com/kodjunkie/nestjs-crud/wiki/RelationLoadStrategy)
- [Logging](https://github.com/kodjunkie/nestjs-crud/wiki/Logging)
- [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching)
- [ServiceTypeorm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm)
- [ServiceDrizzle](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceDrizzle)
- [ServiceMikroOrm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceMikroOrm)
- [CONTRIBUTING.md — Adapter shape](https://github.com/kodjunkie/nestjs-crud/blob/master/CONTRIBUTING.md)
- [CHANGELOG.md — v2.0.0 entry](https://github.com/kodjunkie/nestjs-crud/blob/master/CHANGELOG.md)
