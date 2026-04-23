---
name: nestjs-crud-v2
description: Use when integrating `@nestjs-crud/*` v2.x into a NestJS project — setting up the Prisma adapter (`@nestjs-crud/prisma`), opting into TypeORM split-query relation loading (`relationLoadStrategy: 'query'`), wiring optional loggers, debugging v2-specific symptoms like `RequestQueryException: Invalid persist key`, `RequestQueryException: Invalid field 'X'` (the new strict allowlist), `CrudCacheNotConfiguredError`, `EBADENGINE: Unsupported engine` (Node <22), Prisma `Unknown argument 'where'` inside include, unexpected savepoint semantics on `@Override()`-wrapped updateOne/replaceOne/deleteOne, or understanding transaction-wrapped write-path behavior. For patterns unchanged from v1 (decorator options, `@Crud()` surface, `@Override`, DTOs, `CrudConfigService`, `@CrudAuth` shape, query builder), see the `nestjs-crud` skill. For upgrading from v1.0.x, see the `nestjs-crud-migration` skill.
---

# @nestjs-crud v2.x

Covers behaviors and surfaces that changed or were added in v2. Unchanged patterns (decorator options, `@Override()`, DTOs, `CrudConfigService.load()`, `RequestQueryBuilder`, Best Practices) are documented in the **`nestjs-crud`** skill — read that first for general setup; return here for v2 specifics.

**REQUIRED BACKGROUND:** Read the `nestjs-crud` skill for patterns unchanged in v2.
**UPGRADING FROM v1?** Read the `nestjs-crud-migration` skill for the full change list and audit-greps.

## What's new in v2

| Area | Change | Section |
|---|---|---|
| New adapter | `@nestjs-crud/prisma` (Prisma 5+) | §Prisma Adapter |
| Node version | `engines.node: ">=22.0.0"` on all 7 packages | §Install |
| peerDependencies | Declared on every package; v2 ranges support both Nest 10 and 11 | §Install |
| Strict field allowlist | Unknown sort/filter/search fields throw `RequestQueryException` (was: silent skip) | §Strict Field Allowlist |
| TypeORM split-query opt-in | `@Crud({ query: { relationLoadStrategy: 'query' \| 'join' } })` | §Split-Query Relation Loading |
| Cache fail-fast | `CrudCacheNotConfiguredError` when `@Crud cache` set without provider | §Cache Fail-Fast |
| Optional logger | All 4 adapters accept a logger; **Prisma's surface differs** | §Optional Logger |
| `@CrudAuth` persist | Runtime validation — typos throw `RequestQueryException` | §Auth Persist Runtime Validation |
| Write-path transactions | `updateOne`/`replaceOne`/`deleteOne` wrap at READ COMMITTED | §Transaction Semantics |
| Drizzle `db` field | `protected db: DrizzleClient` (was `any`) | §Typed Signatures |
| MikroORM method signatures | `any` → typed generics on public surface | §Typed Signatures |

## Install

```bash
# Adapters — pick one (or more)
npm install @nestjs-crud/core @nestjs-crud/typeorm
npm install @nestjs-crud/core @nestjs-crud/drizzle
npm install @nestjs-crud/core @nestjs-crud/mikro-orm
npm install @nestjs-crud/core @nestjs-crud/prisma

# Prisma adapter ALSO needs the Prisma CLI as a devDep:
npm install -D prisma
```

**Peers** (declared in v2 — `npm install` warns if missing):

- `@nestjs-crud/core`: `class-validator`, `class-transformer`, `@nestjs/common ^10.0.0 || ^11.0.0`
- `@nestjs-crud/typeorm`: `typeorm ^0.3`, `@nestjs/typeorm`, `@nestjs-crud/core ^2.0`, `@nestjs/common ^10.0.0 || ^11.0.0`
- `@nestjs-crud/drizzle`: `drizzle-orm >=0.45.2`, `@nestjs-crud/core ^2.0`, `@nestjs/common ^10.0.0 || ^11.0.0`
- `@nestjs-crud/mikro-orm`: `@mikro-orm/core ^7.0.0`, `@mikro-orm/knex ^7.0.0`, `@nestjs-crud/{core,request,util} ^2.0`, `@nestjs/common ^10.0.0 || ^11.0.0`
- `@nestjs-crud/prisma`: `@prisma/client >=5.0`, `@nestjs-crud/core ^2.0`, `@nestjs/common ^10.0.0 || ^11.0.0`

**Runtime:** Node 22+ required. `npm install` refuses on older Node (`EBADENGINE`).

## Strict Field Allowlist

**Every v2 consumer hits this.** In v1, unknown fields in `?sort=`, `?search=`, or `?filter=` were silently skipped. In v2, they throw `RequestQueryException` (mapped to `400 Bad Request` by `CrudRequestInterceptor`).

**Audit before upgrading:** every field passed in `?sort=`/`?search=`/`?filter=` MUST be either:
1. A column in `entityColumnsHash` (real entity column), OR
2. A relation explicitly listed in `@Crud({ query: { join: { ... } } })`, in which case dotted paths like `profile.name` work.

**Common breakages:**
- TypeORM `@VirtualColumn` and `@Formula` columns — not in `entityColumnsHash` by default; whitelist via `@Crud({ query: { allow: [...] } })`.
- Client-side aliases for joined-subquery results.
- Dotted paths like `profile.name` when `profile` isn't in the controller's `join=` allowlist.

```
RequestQueryException: Invalid field 'foo' for entity 'User'
```

## Prisma Adapter

New in v2. Same facade + 8 CrudService methods as the other adapters; integrates via `PrismaClient` instance.

```typescript
// users.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaCrudService } from '@nestjs-crud/prisma';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class UsersService extends PrismaCrudService<User> {
  constructor(prisma: PrismaClient) {
    super(prisma, 'user', {
      entityColumns: ['id', 'email', 'isActive', 'companyId', 'deletedAt'],
      primaryColumns: ['id'],
      softDeleteColumn: 'deletedAt',
      // Optional logger lives INSIDE serviceConfig (not a separate ctor arg):
      // logger: { error: console.error, warn: console.warn, debug: console.debug },
    });
  }
}
```

The 3rd argument is a `PrismaCrudServiceConfig` object. The Prisma adapter's ctor signature differs from TypeORM/Drizzle/MikroORM (which take logger as a separate positional argument). See §Optional Logger for the full asymmetry.

Controller + `@Crud()` decorator are identical to other adapters (see `nestjs-crud` skill).

### Prisma-specific behaviors

| Behavior | Notes |
|---|---|
| **Relation fetching uses query decomposition, not SQL JOIN** | `include: { company: true }` emits 2 SELECTs (parent + `WHERE id IN (...)`). 2-level nested = 4 queries. Not N+1 (scales with depth, not rows) but not a single JOIN. Opt into Prisma's `relationJoins` preview feature on your own `PrismaClient` if you need native JOINs — adapter inherits transparently. Not forced. |
| **`where` inside `include` is rejected for to-one relations** at runtime: `Unknown argument 'where'`. Filter to-one relation soft-delete at the parent `where` instead: `where: { company: { deletedAt: null } }`. Adapter handles this automatically for SCondition dotted paths. Filtered `include` works only for to-many. |
| **`createMany` uses `$transaction([create, ...])` array form** for parity with other adapters (full records returned). Prisma native `createMany` returns `{ count }` only — not used. N roundtrips; acceptable since bulk create isn't a CRUD hot path. |
| **Orphan relations return `null`** (matches TypeORM/Drizzle/MikroORM — if a `companyId` points to a missing row, `user.company === null`; no automatic 404). |
| **`$inL`/`$notinL` translate to native Prisma `in`/`notIn`** — no OR/AND expansion. Performant at 5000+ id scale. |
| **Schema.prisma required** as ORM source of truth (Prisma can't consume plain TS entity types). Shape it by hand to mirror your domain; run `npx prisma generate` before tests/builds. |

## Split-Query Relation Loading (TypeORM only)

Opt into TypeORM's native split-query strategy for deep multi-relation reads, where a single SQL JOIN would inflate parent rows by the cross-product of child counts:

```typescript
@Crud({
  model: { type: User },
  query: {
    join: { company: { eager: false }, 'company.projects': { eager: false } },
    relationLoadStrategy: 'query',  // default: 'join' (manual leftJoin/innerJoin)
  },
})
@Controller('users')
export class UsersController { /* ... */ }
```

| Strategy | What happens | When to pick |
|---|---|---|
| `'join'` (default) | Manual `leftJoin`/`innerJoin` via `JoinResolver`. Single SQL query. Today's behavior. | Shallow joins, small fan-out, OR you depend on `JoinOption.allow` to constrain relation columns (see footgun below). |
| `'query'` | TypeORM emits separate queries per relation via `setFindOptions({ relationLoadStrategy: 'query' })`. | Deep multi-relation reads where the JOIN multiplies parent rows by the cross-product of child counts. Trades 1+N round-trips for linear-row payload. |

**N+1 isn't always worse than one big JOIN** — when relations fan out (1→many→many), the JOIN multiplies parent rows by the cross-product of child counts, inflating bytes-on-the-wire and hurting pagination. Split queries trade per-request round-trips for linear-row payload. Pick by query shape, not by reflex.

### ⚠ Footgun: `JoinOption.allow` is ignored under `'query'`

Under the default `'join'` strategy, `JoinOption.allow: ['name', 'domain']` constrains which relation columns are returned. Under `'query'`, TypeORM's `setFindOptions({ relations: { company: true } })` loads **all columns** of the relation regardless. Verified by integration testing: a `company` relation declared `allow: ['name', 'domain']` returned `['createdAt', 'deletedAt', 'description', 'domain', 'id', 'name', 'updatedAt']` under `'query'` vs the expected 3 columns under `'join'`.

**Implication:** if you use `JoinOption.allow` to hide sensitive relation columns from API responses, do NOT opt into `'query'` strategy on those controllers, or audit every relation explicitly.

**Other adapters** (Drizzle, MikroORM, Prisma) use split queries natively — this opt-in is TypeORM-only and a no-op elsewhere.

## Cache Fail-Fast

If you set `@Crud({ query: { cache: 5000 } })` but forget to configure `DataSource({ cache: ... })`, v2 throws a typed error at the first cached query rather than silently no-op'ing:

```
CrudCacheNotConfiguredError: @Crud cache option requires a DataSource cache provider.
Configure DataSource({ cache: { type: 'redis', ... } }) or remove the cache option from
your @Crud() configuration.
```

The error is exported from `@nestjs-crud/core`:

```typescript
import { CrudCacheNotConfiguredError } from '@nestjs-crud/core';
// extends Error, NOT @nestjs/common HttpException — surfaces as a config bug, not a 500
```

**Fix:** either configure `DataSource({ cache: { type: 'redis' | 'database' | true, ... } })` or remove the `cache` field from your `@Crud()` decorator.

**Adapter coverage:** TypeORM only honors `@Crud({ query: { cache } })`. Drizzle, MikroORM, and Prisma do not currently honor this option — use each ORM's native caching primitives at the application layer for now.

## Optional Logger

All 4 adapter services accept a logger, but the surface differs between Prisma and the other 3.

### TypeORM, Drizzle, MikroORM

`logger?: LoggerService` as the last positional ctor argument. Default: `new Logger(<ServiceName>)` when omitted.

```typescript
@Injectable()
export class UsersService extends TypeOrmCrudService<User> {
  constructor(
    @InjectRepository(User) repo: Repository<User>,
    @Inject(Logger) logger: LoggerService,   // optional
  ) {
    super(repo, logger);                      // pass-through; defaults to new Logger if omitted
  }
}
```

### Prisma (different shape)

The logger lives inside the `serviceConfig` object as a structural shape `{ error, warn?, debug? }`, **not** a separate ctor arg. Default when omitted: **silent no-op** (the adapter optional-chains every log call).

```typescript
constructor(prisma: PrismaClient) {
  super(prisma, 'user', {
    entityColumns: [...],
    primaryColumns: [...],
    softDeleteColumn: 'deletedAt',
    logger: { error: console.error, warn: console.warn, debug: console.debug },
    // OR pass a NestJS Logger (it satisfies the {error, warn?, debug?} shape):
    // logger: new Logger('UsersService'),
  });
}
```

If you want Prisma to behave like the other 3 adapters (auto-instantiate a Logger on omission), pass `new Logger(...)` explicitly via `serviceConfig.logger` until the asymmetry is harmonized in a future release.

### Emission policy (all adapters)

- `debug` — query-build tracing (off by default in production NestJS logger config)
- `warn` — SQLi rejections, transaction rollbacks
- `error` — uncaught DB errors; message uses `err.name` (never `err.message`, since DB drivers leak SQL parameters there); stack passed as second arg per `LoggerService` signature

`@internal` pieces (`WhereBuilder`, `QueryComposer`, `FetchHelper`) do NOT receive logger — stay pure.

## Auth Persist Runtime Validation

In v1, typos in `@CrudAuth({ persist: { user_id: ... } })` (entity column: `userId`) were silently ignored — auth-filter bypass.

In v2, `RequestQueryParser` validates each persist key against `entityColumnsHash` at runtime. Unknown keys throw `RequestQueryException` (extends `Error`; `CrudRequestInterceptor` maps to `400 Bad Request`):

```
RequestQueryException: Invalid persist key 'user_id' — not in entityColumnsHash
```

**Action:** audit every `@CrudAuth({ persist: { ... } })` block against your entity column names. Typos now fail fast.

## Transaction Semantics (Write Overrides)

`updateOne`, `replaceOne`, `deleteOne` on all 4 adapters wrap their read-modify-write bodies in a transaction at **READ COMMITTED**. Closes a lost-update race window. Consumer-visible semantics unchanged for standard flows.

**Scope:** these 3 ops ONLY. `recoverOne` is EXCLUDED (plain `update({ deletedAt: null })` — no prior read, no race window). No retry. No consumer config knob.

**Per-adapter primitive:**

| Adapter | Transaction |
|---|---|
| TypeORM | `QueryRunner` with scoped `Repository`, `startTransaction('READ COMMITTED')` |
| Drizzle | `db.transaction(async (tx) => ..., { isolationLevel: 'read committed' })` + `translator.cloneFor(tx)` |
| MikroORM | `em.transactional(async (txEm) => RequestContext.create(txEm, async () => ...), { isolationLevel: IsolationLevel.READ_COMMITTED })` |
| Prisma | `$transaction(async (tx) => ..., { isolationLevel: 'ReadCommitted' })` |

### Nesting with consumer `@Override()`

If you `@Override()` one of these ops and open your own outer transaction, the adapter's inner tx becomes a **savepoint** inside yours (on all 4 adapters):

```typescript
@Override('updateOne')
async updateOne(@ParsedRequest() req: CrudRequest, @ParsedBody() dto: User) {
  return this.dataSource.transaction(async (manager) => {
    // outer tx
    const user = await super.updateOne(req, dto);  // inner = savepoint
    await this.auditLog.record(user, manager);
    return user;
  });
}
```

**Caveats:**
- Inner READ COMMITTED is best-effort: if your outer tx set a higher isolation (SERIALIZABLE, REPEATABLE READ), the inner call does NOT downgrade it.
- Savepoint semantics apply on TypeORM, Drizzle, and MikroORM v7. Prisma `$transaction` inside an outer Prisma tx also creates a savepoint.
- Rollbacks cascade up normally.

If you don't want nesting, call the adapter's read/write primitives directly instead of `super.updateOne(...)`.

## Typed Signatures (what v1 subclass code may need to adjust)

v2 tightens adapter-internal types:

- **Drizzle:** `protected db: DrizzleClient` (was `any`). If your subclass re-declared `protected db: any`, delete the re-declaration and inherit the typed field from the base.
- **MikroORM:** 15 `any` sites on public method signatures replaced with typed generics (`FilterQuery<T>`, `RequiredEntityData<T>`, `EntityMetadata<T>`, `QueryOrderMap<T>`). Callsites that passed untyped values may need explicit annotations.
- **Core:** `SwaggerEnumType` inlined — no more internal `@nestjs/swagger/dist/types/swagger-enum.type` import. If you imported it, inline the type locally: `string[] | number[] | (string | number)[] | Record<number, string>`.

Standard consumer code (just extending a service and wiring it to NestJS DI) is unaffected.

## Common Issues — v2-specific

(For v1-era common issues like relations not loading, `maxLimit` exceeded, `alwaysPaginate` placement — see `nestjs-crud` skill §Common Issues.)

| Symptom | Cause | Fix |
|---|---|---|
| `EBADENGINE: Unsupported engine` on `npm install` | Node <22 | Upgrade to Node 22+ or pin to `^1.0.2` |
| `RequestQueryException: Invalid field 'X'` → 400 Bad Request | Strict field allowlist — `?sort=`/`?search=`/`?filter=` references a field not in `entityColumnsHash` and not in an explicit `join=` relation | Add the field to entity columns, whitelist via `@Crud({ query: { allow: [...] } })`, or join the relation. See §Strict Field Allowlist |
| `RequestQueryException: Invalid persist key 'X'` → 400 Bad Request | `@CrudAuth({ persist: { ... } })` has a typo | Fix the key name to match the entity column exactly |
| `CrudCacheNotConfiguredError` thrown on first cached read | `@Crud({ query: { cache } })` set but `DataSource({ cache: ... })` not configured | Configure DataSource cache provider OR remove `@Crud cache` option. See §Cache Fail-Fast |
| `@Crud({ query: { cache } })` silently does nothing on Drizzle/MikroORM/Prisma | Adapter doesn't honor the option — only TypeORM does | Use the ORM's native caching at the application layer; or move the cached read to a TypeORM-backed controller |
| Relation columns under `'query'` strategy include columns NOT in `JoinOption.allow` | Documented divergence — `setFindOptions` doesn't expose alias-level select control | Either keep `'join'` strategy on those controllers, or explicitly audit which columns ship for each relation. See §Split-Query Relation Loading footgun |
| Prisma logger silently does nothing | Prisma's `serviceConfig.logger` defaults to no-op when omitted (asymmetry vs other adapters) | Pass `new Logger(...)` explicitly via `serviceConfig.logger`. See §Optional Logger |
| Prisma: `Unknown argument 'where'` on `include: { company: { where: {...} } }` | Prisma rejects `where` inside `include` for to-one relations | Filter at parent `where`: `{ where: { company: { ... } } }`. Use filtered `include` only for to-many |
| Prisma: deep includes feel slow / emit N+1-looking query logs | Default query decomposition — N queries where N = relation depth + 1 | Opt into Prisma's `relationJoins` preview feature on your own `PrismaClient`. Not forced by library |
| Prisma: `createMany` returns fewer fields than other adapters | Fixed in v2 — uses `$transaction([create, ...])` for full-record parity | No action — verify you're on v2 |
| Unexpected savepoint semantics or rollback cascading when your `@Override()` wraps updateOne in an outer tx | Inner tx is now a savepoint | Intentional; decide whether outer-tx nesting is what you want (§Transaction Semantics — Nesting) |
| MikroORM: `SyntaxError: Unexpected token 'export'` / `import.meta outside a module` | Running MikroORM specs without the ESM preset | Use `yarn test:mikro-orm` (has `NODE_OPTIONS=--experimental-vm-modules` inline) |
| MikroORM: stale entity from previous request | Subclass cached `em` at ctor time | Replace captured `em` field with `this.getEm()` call inside every method |

## Still on v1.0.x?

Pin to `^1.0.2` in your package.json:

```json
{
  "dependencies": {
    "@nestjs-crud/core": "^1.0.2",
    "@nestjs-crud/typeorm": "^1.0.2"
  }
}
```

`npm update` will continue to track the v1.0.x line. The v1.0.x line continues to receive bugfix patches on the `v1.0.2` branch.

To upgrade: read the `nestjs-crud-migration` skill for the complete change list, pre-upgrade audit greps, and error-to-fix mapping.
