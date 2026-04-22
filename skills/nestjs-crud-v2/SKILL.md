---
name: nestjs-crud-v2
description: Use when integrating `@nestjs-crud/*` v2.x into a NestJS project — setting up the Prisma adapter (`@nestjs-crud/prisma`), wiring the optional `logger?: LoggerService` on adapter ctors, debugging v2-specific symptoms like `RequestQueryException: Invalid persist key`, `EBADENGINE: Unsupported engine` (Node <22), Prisma `Unknown argument 'where'` inside include, unexpected savepoint semantics on `@Override()`-wrapped updateOne/replaceOne/deleteOne, or understanding SEC-03 transaction behavior. For patterns unchanged from v1 (decorator options, `@Crud()` surface, `@Override`, DTOs, `CrudConfigService`, `@CrudAuth` shape, query builder), see the `nestjs-crud` skill. For upgrading from v1.0.x, see the `nestjs-crud-migration` skill.
---

# @nestjs-crud v2.x

Covers behaviors and surfaces that changed or were added in v2. Unchanged patterns (decorator options, `@Override()`, DTOs, `CrudConfigService.load()`, `RequestQueryBuilder`, Best Practices) are documented in the **`nestjs-crud`** skill — read that first for general setup; return here for v2 specifics.

**REQUIRED BACKGROUND:** Read the `nestjs-crud` skill for patterns unchanged in v2.
**UPGRADING FROM v1?** Read the `nestjs-crud-migration` skill for the full change list and audit-greps.

## What's new in v2

| Area | Change | Section |
|---|---|---|
| New adapter | `@nestjs-crud/prisma` (Prisma 5+) | §Prisma Adapter |
| Node version | `engines.node: ">=22.0.0"` on all 6 packages | §Install |
| peerDependencies | Declared on every package (v1 typeorm had none) | §Install |
| Optional logger | `logger?: LoggerService` as last positional ctor arg | §Optional Logger |
| `@CrudAuth` persist | Runtime validation — typos throw `RequestQueryException` | §SEC-02 Runtime Validation |
| Write-path transactions | `updateOne`/`replaceOne`/`deleteOne` wrap at READ COMMITTED | §SEC-03 Transaction Semantics |
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
- `@nestjs-crud/core`: `class-validator`, `class-transformer`, `@nestjs/common`
- `@nestjs-crud/typeorm`: `typeorm ^0.3`, `@nestjs/typeorm`, `@nestjs-crud/core ^2.0`, `@nestjs/common`
- `@nestjs-crud/drizzle`: `drizzle-orm >=0.40`, `@nestjs-crud/core ^2.0`, `@nestjs/common`
- `@nestjs-crud/mikro-orm`: `@mikro-orm/core >=7.0`, `@mikro-orm/knex >=6.0`, `@nestjs-crud/{core,request,util}`, `@nestjs/common`
- `@nestjs-crud/prisma`: `@prisma/client >=5.0`, `@nestjs-crud/core ^2.0`, `@nestjs/common`

**Runtime:** Node 22+ required. `npm install` refuses on older Node (`EBADENGINE`).

⚠ **Known peer-range bug (backlog 999.4):** v2's current peers declare `@nestjs/common: ^10.0.0` but the repo's own devDeps use v11. If your app is on NestJS 11, you'll see a non-blocking peer warning — runtime works fine. Scheduled to be corrected to `^11.0.0` before v2.0.0 GA.

## Prisma Adapter

New in v2. Same facade + 8 CrudService methods as the other adapters; integrates via `PrismaClient` instance.

```typescript
// user.service.ts
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
    });
  }
}
```

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

## Optional Logger

All 4 adapter services accept `logger?: LoggerService` as the last positional ctor argument. Default: `new Logger(this.constructor.name)` when omitted.

```typescript
@Injectable()
export class UsersService extends TypeOrmCrudService<User> {
  constructor(
    @InjectRepository(User) repo: Repository<User>,
    @Inject(Logger) logger: LoggerService,   // optional
  ) {
    super(repo, logger);                      // pass-through
  }
}
```

**Emission policy** (adapter-internal — consumers just inject the logger):
- `debug` — query-build tracing (off by default in production NestJS logger config)
- `warn` — SQLi rejections, SEC-03 rollbacks
- `error` — uncaught DB errors; message uses `err.name` (never `err.message`, since DB drivers leak SQL parameters there); stack passed as second arg per `LoggerService` signature

`@internal` pieces (`WhereBuilder`, `QueryComposer`, `FetchHelper`) do NOT receive logger — stay pure.

## SEC-02 Runtime Validation (`@CrudAuth`)

In v1, typos in `@CrudAuth({ persist: { user_id: ... } })` (entity column: `userId`) were silently ignored — auth-filter bypass.

In v2, `RequestQueryParser` validates each persist key against `entityColumnsHash` at runtime. Unknown keys throw `RequestQueryException` (extends `Error`; `CrudRequestInterceptor` maps to `400 Bad Request`):

```
RequestQueryException: Invalid persist key 'user_id' — not in entityColumnsHash
```

**Action:** audit every `@CrudAuth({ persist: { ... } })` block against your entity column names. Typos now fail fast.

## SEC-03 Transaction Semantics (Write Overrides)

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
| `RequestQueryException: Invalid persist key 'X'` → 400 Bad Request | SEC-02 — `@CrudAuth({ persist: { ... } })` has a typo | Fix the key name to match the entity column exactly |
| Prisma: `Unknown argument 'where'` on `include: { company: { where: {...} } }` | Prisma rejects `where` inside `include` for to-one relations | Filter at parent `where`: `{ where: { company: { ... } } }`. Use filtered `include` only for to-many |
| Prisma: deep includes feel slow / emit N+1-looking query logs | Default query decomposition — N queries where N = relation depth + 1 | Opt into Prisma's `relationJoins` preview feature on your own `PrismaClient`. Not forced by library |
| Prisma: `createMany` returns fewer fields than other adapters | Fixed in v2 — uses `$transaction([create, ...])` for full-record parity | No action — verify you're on v2 |
| Unexpected savepoint semantics or rollback cascading when your `@Override()` wraps updateOne in an outer tx | SEC-03 inner tx is now a savepoint | Intentional; decide whether outer-tx nesting is what you want (§SEC-03 Nesting) |
| MikroORM: `SyntaxError: Unexpected token 'export'` / `import.meta outside a module` | Running MikroORM specs without the ESM preset | Use `yarn test:mikro-orm` (has `NODE_OPTIONS=--experimental-vm-modules` inline) |
| MikroORM: stale entity from previous request | Subclass cached `em` at ctor time | Replace captured `em` field with `this.getEm()` call inside every method |
| npm install warning: `@nestjs/common@^10.0.0 but found ^11.x` | Known bug 999.4 | Non-blocking. Runtime works. Correction to `^11.0.0` scheduled before v2.0.0 GA |

## Still on v1.0.x?

Pin to `^1.0.2` and use the `nestjs-crud` skill for general setup. The v1.0.x line continues to receive bugfix patches on the `v1.0.2` branch.

To upgrade: read the `nestjs-crud-migration` skill for the complete change list, pre-upgrade audit greps, and error-to-fix mapping.
