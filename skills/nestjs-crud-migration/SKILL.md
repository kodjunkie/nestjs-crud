---
name: nestjs-crud-migration
description: >-
  Use when migrating a NestJS project from @nestjs-crud/* v1.0.x to v2.0 OR from @nestjs-crud/prisma@2.0.x on @prisma/client@^5 / ^6 to @nestjs-crud/prisma@2.1.0 on @prisma/client@^7 (schema `datasource.url` removal, `prisma.config.ts` forwarding, `prisma db push --skip-generate` flag drop, `PrismaClient` driver-adapter wiring, `@prisma/adapter-pg` search_path landmine, `@prisma/adapter-mariadb` session-state landmine), diagnosing v2 upgrade errors (`Field "X" is not allowed`, `setSearchCondition is not a function`, `checkSqlInjection is not a function`, `entityRelationsHash` undefined, `translator.count is not a function`, `findOneOrFail is not a function`, `RequestQueryException: Invalid persist key`, `CrudCacheNotConfiguredError`, Drizzle `Type 'any' is not assignable to type 'DrizzleClient'`, MikroORM `FilterQuery<T>` type errors, MikroORM stale-em identity-map issues, Prisma `Unknown argument 'where'` inside include, `Your Prisma Client was configured with datasourceUrl, but the datasource in schema.prisma does not expose a URL`, `The property url on the datasource block is not allowed`, `Unknown argument '--skip-generate'`, `EBADENGINE: Unsupported engine`), Swagger snapshot-test drift (summaries rewritten to imperative form, `operationsMap` return-shape break), opting into the new TypeORM `relationLoadStrategy: 'query'`, adopting `@nestjs-crud/prisma`, or auditing peerDependencies for `@nestjs/common ^10 || ^11`.
---

# @nestjs-crud v1 → v2 Migration

## Overview

v2.0.0 is a single coordinated breaking release. It tightens types, validates input strictly, transactional-wraps mutating ops, adds the Prisma adapter, and bumps the Node floor. This skill is the consumer-facing migration playbook.

**If you can't migrate yet:** pin to `^1.0.2`:

```json
{
  "dependencies": {
    "@nestjs-crud/core": "^1.0.2",
    "@nestjs-crud/typeorm": "^1.0.2"
  }
}
```

`npm update` continues to track the v1.0.x line. The v1.0.x line continues to receive bugfix patches.

## Pre-Upgrade Audit — Run These Greps First

Before bumping to v2, search your codebase for anything that will break:

```bash
# 1. Query params with fields that may not be in entityColumnsHash
#    (sort=, filter=, search=, fields=, join=) — strict allowlist now throws
grep -rE "sort=|filter=|search=|fields=" src/ test/

# 2. Services subclassing @nestjs-crud adapters and overriding deleted internals
#    Any of these method overrides break — see §B
grep -rE "(setSearchCondition|setAndWhere|setOrWhere|setJoin|getRelationMetadata|checkSqlInjection|mapSort|getFieldWithAlias|getSort)\s*\(" src/

# 3. Custom translators / services affected by interface amendments
#    Custom QueryTranslator implementations need count() + findOneOrFail()
grep -rE "implements QueryTranslator<|extends TypeOrmQueryTranslator" src/

# 4. MikroORM subclass overrides that might cache em (stale identity-map risk)
grep -rE "this\.em\s*=|private\s+(readonly)?\s*em:\s*EntityManager" src/

# 5. Runtime mutation of deleted fields
grep -rE "\.(sqlInjectionRegEx|entityRelationsHash)\s*=" src/

# 6. doGetMany / createBuilder subclass overrides (shape changed in v2)
grep -rE "(doGetMany|createBuilder|prepareEntityBeforeSave|getSelect)\s*\(" src/

# 7. Drizzle subclasses typing `protected db: any` — DrizzleClient typing now strict
grep -rE "protected\s+db\s*:\s*any|extends\s+DrizzleCrudService" src/

# 8. MikroORM subclasses overriding public methods (typed return signatures now)
grep -rE "extends\s+MikroOrmCrudService|override\s+(getMany|getOne|createOne|createMany|updateOne|replaceOne|deleteOne|recoverOne)" src/

# 9. Internal Swagger import — SwaggerEnumType inlined
grep -rE "from\s+['\"]@nestjs/swagger/dist/types/swagger-enum\.type['\"]|SwaggerEnumType" src/

# 10. Consumer @Override() on updateOne/replaceOne/deleteOne — transaction-nesting audit
#     Inner adapter tx creates a savepoint if consumer already opened one
grep -rE "@Override\(\)\s*(async\s+)?(updateOne|replaceOne|deleteOne)" src/

# 11. Runtime @CrudAuth persist key usage — runtime validation now throws on typos
grep -rE "@CrudAuth|CrudAuth\s*\(\s*\{" src/

# 12. @Crud cache option usage — without DataSource cache provider, now throws fail-fast
grep -rE "cache:\s*[0-9]+|cache:\s*true" src/

# 13. Node version — engines.node now ">=22.0.0"
node --version  # must be >=22; else install will refuse

# 14. Swagger snapshot tests or direct operationsMap import — v2 rewrites default text and changes internal shape
grep -rE "toMatchSnapshot.*swagger|toMatchSnapshot.*apioperation|Swagger\.operationsMap" src/ test/
```

**Disposition:**
- Non-zero on (1) → strict allowlist audit (§A)
- Non-zero on (2)/(3)/(4)/(5)/(6)/(7)/(8) → subclass migration work (§B)
- Non-zero on (9) → one-line Swagger import swap (§C)
- Non-zero on (10) → audit transaction-nesting semantics (§D — write-path transactions)
- Non-zero on (11) with any typo in `persist` keys → expect `RequestQueryException` at runtime (§D — auth persist)
- Non-zero on (12) without DataSource cache configured → expect `CrudCacheNotConfiguredError` (§D — cache fail-fast)
- (13) failing → either upgrade Node or stay on v1.0.x
- Non-zero on (14) → Swagger snapshot-drift or `operationsMap` return-shape break (§D — Swagger)

## Quick Reference — What Breaks

| Area | Impact | Section |
|---|---|---|
| **Strict column-name allowlist** — unknown sort/filter/search/fields fail with 400 | High — every consumer with typos, virtual columns, or dotted paths | §A |
| **Deleted internal service methods** (setSearchCondition, setAndWhere, setOrWhere, setJoin, getRelationMetadata, checkSqlInjection, mapSort, getFieldWithAlias, getSort) | Medium — subclass-override consumers only | §B |
| **`InputSanitizer` replaces `checkSqlInjection`** + `sqlInjectionRegEx` deletion | Medium — same audience | §B |
| **`TypeOrmQueryTranslator` ctor → config-object** `(repo, { entityColumnsHash, entityHasDeleteColumn, onBadRequest, joinResolver })` | Medium — custom translator consumers | §B |
| **`findOneOrFail` + `count(qb)` added to `QueryTranslator<Q,W>` interface** | Medium — custom translator must implement; otherwise `translator.count is not a function` | §B |
| **Drizzle + MikroORM service ctors → config-object pattern** | Medium — custom adapter subclasses | §B |
| **MikroORM `getEm: () => EntityManager` thunk contract** | Medium — consumers who cache `em` across calls reintroduce cross-request identity-map bug | §B |
| **Translator decomposition** — `@internal` `WhereBuilder` / `QueryComposer` / `FetchHelper` pieces | Low — public `QueryTranslator<Q,W>` contract unchanged | §B |
| **`integration/typeorm/` deleted** (moved to `packages/typeorm/test/__fixture__/app/`; new `examples/typeorm-demo/` for demos) | None for consumers; affects only contributors pointing at old paths | — |
| **MikroORM Jest ESM config** (per-package `jest.config.js` + `NODE_OPTIONS=--experimental-vm-modules`) | None for consumers; contributors run `yarn test:mikro-orm` | — |
| **Drizzle `protected db: DrizzleClient`** (was `any`) | Medium — subclasses typing `protected db: any` now conflict with the base | §C |
| **MikroORM public method signatures typed** (15 `any` sites → `EntityMetadata<T>` / `FilterQuery<T>` / `RequiredEntityData<T>` / `QueryOrderMap<T>`) | Medium — subclasses relying on `any` permissiveness now get compile errors | §C |
| **`SwaggerEnumType` inlined** (no more `@nestjs/swagger/dist/types/swagger-enum.type` import) | Low — one-line swap if you imported the internal path | §C |
| **Optional logger on TypeORM/Drizzle/MikroORM services** — `logger?: LoggerService` ctor arg, defaults to `new Logger(<class-name>)` | None — additive, opt-in | §D |
| **Prisma logger differs** — `serviceConfig.logger?: { error, warn?, debug? }` field, defaults to silent no-op | Low — affects only Prisma consumers | §D |
| **`@CrudAuth` persist key runtime validation** — throws `RequestQueryException` on unknown keys | Medium — previously-silent typos now fail fast (auth-filter bypass closed) | §D |
| **Write-path transaction wrap on `updateOne` / `replaceOne` / `deleteOne`** at READ COMMITTED on all 4 adapters | Low for standard consumers; medium for consumers with outer transactions or custom `@Override()` on these ops | §D |
| **`recoverOne` EXCLUDED from transaction wrap** — plain `update(...)`, no read-modify-write race | None — documented behavior | §D |
| **TypeORM split-query relation loading opt-in** — `@Crud({ query: { relationLoadStrategy: 'query' \| 'join' } })`, default `'join'` (today's behavior) | None — additive opt-in. ⚠ Footgun: under `'query'`, `JoinOption.allow` does NOT constrain relation columns | §D |
| **TypeORM cache fail-fast** — `@Crud({ query: { cache: N } })` without `DataSource({ cache: ... })` now throws `CrudCacheNotConfiguredError` | Medium — was silent no-op in v1; now loud config error | §D |
| **Swagger default text rewritten** + new `@Crud({ swagger: {...} })` override surface + `Swagger.operationsMap` internal shape break (`string` → `{ summary, description }`) | Low for runtime (additive). Medium for Swagger **snapshot-testing** consumers or direct `operationsMap` callers | §D |
| **`engines.node: ">=22.0.0"`** in all 7 packages | Low — `npm install` refuses on older Node | §E |
| **peerDependencies declared on all packages** | Low — `npm install` warns if peers missing | §E |
| **`@nestjs-crud/prisma` new adapter package** (Prisma 5+) | None for existing consumers — additive | §F |

---

## §A. Strict Column-Name Allowlist

**Most consumers feel v2 here first.** Any field name passed through `sort=`, `filter=`, `search=`, `fields=`, or `join=` must now be in the entity's `entityColumnsHash`. Everything else throws `BadRequestException: Field "X" is not allowed`.

### What changed

| | v1.x | v2.0 |
|---|---|---|
| Validation | Denylist regex (SQL-injection patterns) | **Allowlist** from `entityColumnsHash` |
| Unknown field | Silent 200 OK (typos, missing columns return empty) | **400 — `Field "X" is not allowed`** |
| Backing regex | `sqlInjectionRegEx` on each adapter | **Deleted entirely** — `InputSanitizer` is the sole validation path |
| Opt-out flag | — | **None.** No `strictSanitization: false`, no global kill-switch |

### Consumer impact

Fields that passed v1's denylist but aren't entity columns now throw:

- **Column typos** — `?fields=neame` → 400 (previously silent empty result)
- **`@VirtualColumn` / `@Formula` fields** not in entity metadata — 400
- **Relation-qualified dotted paths** (`?sort=author.name`) — require the relation to be explicitly joined via `?join=author` AND registered in `@Crud({ query: { join: {...} } })`. Unknown relations throw before reaching SQL.

### Migration

1. **Audit every route's** `sort=` / `search=` / `filter=` / `fields=` usage against entity `@Column` definitions.
2. **Virtual / formula / computed fields** — register them in `entityColumnsHash` (consult your ORM docs) or stop referencing them in query params.
3. **Dotted paths** — add `?join=relation` to the request AND register the relation in the `@Crud({ query: { join: {...} } })` options.
4. **No silent typo tolerance** — fix column names in client-side `RequestQueryBuilder` calls.

### Before / after

```ts
// v1.x
GET /users?fields=neame                  // 200 OK, empty result (silent typo)
GET /users?sort=author.name              // 200 OK (no join required)

// v2.0
GET /users?fields=neame                  // 400 — 'Field "neame" is not allowed'
GET /users?sort=author.name              // 400 — unless ?join=author is also present
                                         //       AND author is in @Crud({ query: { join: { author: {} } } })
GET /users?sort=author.name&join=author  // 200 OK
```

### No opt-out — why not?

A runtime opt-out was considered and explicitly rejected: it would have been a security kill-switch that consumers would leave enabled indefinitely. v2 is a breaking release and the allowlist audit is part of the upgrade cost. If you need to ship without the audit, stay on v1.0.x.

---

## §B. Deleted Service Internals + Interface Changes

Affects **consumers who subclass `TypeOrmCrudService` / `DrizzleCrudService` / `MikroOrmCrudService` and override protected/private internals, OR consumers with custom `QueryTranslator<Q, W>` implementations.** Standard usage (just extending the class and wiring it to NestJS DI) is unaffected.

### Deleted protected/private service methods

| Surface | v1 location | v2 status | Replacement |
|---|---|---|---|
| `setSearchCondition(builder, search)` | `TypeOrmCrudService` protected | Deleted | `TypeOrmQueryTranslator.buildWhere` |
| `setAndWhere(cond, i, builder)` | `TypeOrmCrudService` protected | Deleted | Absorbed into translator |
| `setOrWhere(cond, i, builder)` | `TypeOrmCrudService` protected | Deleted | Absorbed into translator |
| `setJoin(cond, joinOptions, builder)` | `TypeOrmCrudService` protected | Deleted | `TypeOrmJoinResolver.applyJoins` |
| `getRelationMetadata(field, options)` | `TypeOrmCrudService` protected | Deleted | `TypeOrmJoinResolver` internal |
| `checkSqlInjection(field)` | all 3 adapters, private | Deleted | `InputSanitizer.assert(field)` |
| `mapSort(sort)` | `TypeOrmCrudService` protected | Deleted | `TypeOrmQueryComposer` (internal piece) — override via custom translator's composer |
| `getFieldWithAlias(field, sort)` | `TypeOrmCrudService` protected | Deleted | `TypeOrmQueryComposer` internal |
| `getSort()` | `TypeOrmCrudService` protected | Deleted | `TypeOrmQueryComposer` internal |
| `prepareEntityBeforeSave(dto, parsed)` | `TypeOrmCrudService` protected | Retained as 1-line delegator | `@nestjs-crud/core/util/prepare-entity-before-save` pure util |
| `getSelect(query, options)` | `TypeOrmCrudService` protected | Retained as 1-line delegator | `@nestjs-crud/core/util/get-select` pure util |
| `findOneOrFail(req, shallow, withDeleted)` | `TypeOrmCrudService` protected | Retained as 1-line delegator | `TypeOrmQueryTranslator.findOneOrFail` — override on translator |

### Deleted fields

| Field | v1 location | v2 status |
|---|---|---|
| `sqlInjectionRegEx` | all 3 adapters | Deleted — no equivalent (denylist fallback removed entirely) |
| `entityRelationsHash` | `TypeOrmCrudService` protected | Moved onto `TypeOrmJoinResolver` instance |

### Interface contract changes

Custom `QueryTranslator<Q, W>` implementations must implement the following methods. Consumers who `implements QueryTranslator<X, Y>` get TypeScript errors until they add these:

| Method | Contract |
|---|---|
| `buildWhere(search: SCondition): W` | Returns the ORM's predicate type |
| `applyToQuery(qb: Q, parsed: ParsedRequestParams, options: CrudRequestOptions): Q` | Applies WHERE + sort + pagination + field selection + soft-delete + eager joins |
| `findOneOrFail(qb: Q, opts: FindOneOrFailOptions): Promise<T>` | Executes a prepared query; throws if no result |
| `count(qb: Q): Promise<number>` | Returns row count for the query (`qb.getCount()` in TypeORM; `sql\`count(*)\`` in Drizzle; `qb.getCount()` in MikroORM) |

### Adapter service ctor changes

All adapter services use the config-object ctor pattern. Custom subclasses that reached into protected/private state via `as unknown as` casts break:

```ts
// v1-ish style (consumers subclassing and reaching internals)
class MyService extends TypeOrmCrudService<User> {
  private doSomething() {
    (this as unknown as { entityColumnsHash: ObjectLiteral }).entityColumnsHash;  // ❌ casts removed
  }
}

// v2
class MyService extends TypeOrmCrudService<User> {
  private doSomething() {
    this.entityColumnsHash;  // ✅ now a public/protected readonly field
  }
}
```

### MikroORM `getEm: () => EntityManager` thunk contract

**Critical for MikroORM subclass consumers.** `MikroOrmFetchHelper` takes a `getEm: () => EntityManager` thunk (not a captured `em` field). Every method calls `this.getEm()` fresh to preserve per-request identity-map isolation. Consumers who subclass the helper or translator and cache `em` across calls reintroduce the cross-request identity-map pollution bug that the thunk design prevents.

```ts
// ❌ BAD — captures em at ctor; cross-request identity-map bug
class MyFetchHelper extends MikroOrmFetchHelper<User> {
  private readonly em: EntityManager;  // ← captured, stale across requests
  constructor(getEm: () => EntityManager, config: ...) {
    super(getEm, config);
    this.em = getEm();  // DO NOT do this
  }
  override count(qb) { return this.em.count(User, {}); }  // uses stale em
}

// ✅ GOOD — resolves em fresh per call
class MyFetchHelper extends MikroOrmFetchHelper<User> {
  override count(qb) { return this.getEm().count(User, {}); }  // ← fresh em
}
```

### Internal piece interfaces — advanced extension surface

Each adapter's translator decomposes into 3 internal pieces: `WhereBuilder<Q, W>`, `QueryComposer<Q>`, `FetchHelper<Q>`. These live in `@nestjs-crud/core/query` (deep-path only — NOT in the main `@nestjs-crud/core` barrel) and are marked `@internal` via JSDoc. The dotted-path-sort SQLi guard now lives inside each adapter's `QueryComposer`, not on the translator class directly.

**Public `QueryTranslator<Q, W>` contract is unchanged.** Consumers subclassing the translator work exactly as before. The pieces are available for advanced customization via deep-path import, but are explicitly NOT covered by semver-minor stability guarantees — they may change in v2.x patches without major bumps.

```ts
// Public — stable across v2.x
import type { QueryTranslator } from '@nestjs-crud/core';
import { TypeOrmQueryTranslator } from '@nestjs-crud/typeorm';

// @internal — only if you accept v2.x churn
import type { QueryComposer } from '@nestjs-crud/core/query';
```

### Migration for subclassers

1. **Override translator, not service**, where possible — the translator + its 3 pieces are the customization surface v2 targets.
2. **Add `count()` and `findOneOrFail()`** to any custom `QueryTranslator<Q, W>` implementation. The `count()` error is the most common v2 upgrade error for consumers with custom translators.
3. **For `checkSqlInjection` overrides:** implement the `InputSanitizer` interface (`check(field): boolean` + `assert(field): void`).
4. **For `sqlInjectionRegEx` runtime mutation:** no replacement. Denylist fallback removed entirely. Encode custom rules in a custom `InputSanitizer` implementation.
5. **MikroORM consumers:** if subclassing FetchHelper or translator, never cache `em` — always `this.getEm()` fresh.

```ts
// Example v2 custom translator
import { TypeOrmQueryTranslator } from '@nestjs-crud/typeorm';
import type { SCondition } from '@nestjs-crud/request';
import type { Brackets, SelectQueryBuilder } from 'typeorm';

class MyTranslator<T extends ObjectLiteral> extends TypeOrmQueryTranslator<T> {
  override buildWhere(search: SCondition): Brackets | undefined {
    return super.buildWhere(search);
  }
  // count() and findOneOrFail() inherited from parent — don't need to re-implement
  // unless customizing
}
```

---

## §C. Type Tightening

### Drizzle `protected db: DrizzleClient`

v1: `protected db: any`. v2: `protected db: DrizzleClient` — a structural interface in `@nestjs-crud/drizzle` declaring `select`, `insert`, `update`, `delete`, `transaction`, optional `dialect`. Structurally compatible with both `NodePgDatabase` and `MySql2Database`.

```ts
// v1 — compiled under `any`
class MyDrizzle extends DrizzleCrudService<User> {
  protected db: any;  // ❌ v2: Type 'any' is not assignable to type 'DrizzleClient'
}

// v2 — inherit the typed field from the base; no re-declaration
import type { DrizzleClient } from '@nestjs-crud/drizzle';
class MyDrizzle extends DrizzleCrudService<User> {
  override someMethod() {
    const client: DrizzleClient = this.db;  // ✅
  }
}
```

### MikroORM public method signatures typed

15 `any` sites replaced with typed generics from `@mikro-orm/core`: `EntityMetadata<T>`, `FilterQuery<T>`, `RequiredEntityData<T>`, `QueryOrderMap<T>`. Subclasses that relied on `any` permissiveness get compile errors until callsites are annotated.

### `SwaggerEnumType` inlined

v1 imported `SwaggerEnumType` from `@nestjs/swagger/dist/types/swagger-enum.type` (internal path). v2 inlines it as `string[] | number[] | (string | number)[] | Record<number, string>`. One-line swap for consumers who imported the same internal path.

---

## §D. Behavior Changes (Logger, Validation, Transactions, Strategy, Cache)

### Optional logger — TypeORM, Drizzle, MikroORM

`logger?: LoggerService` as the last positional ctor argument. Default: `new Logger(<ServiceName>)` when omitted.

```ts
@Injectable()
export class UsersService extends TypeOrmCrudService<User> {
  constructor(
    @InjectRepository(User) repo: Repository<User>,
    @Inject(Logger) logger: LoggerService,   // optional
  ) {
    super(repo, logger);                      // pass-through; defaults to new Logger
  }
}
```

Additive only — no migration required.

### Optional logger — Prisma (different surface, same default behavior)

The Prisma adapter exposes the logger inside the `serviceConfig` object as a structural shape `{ error, warn?, debug? }`, **not** a separate ctor arg. Default when omitted: ctor auto-instantiates `new Logger(PrismaCrudService.name)` — same as the other 3 adapters. Consumers who previously passed `new Logger(...)` explicitly can drop the line.

```ts
constructor(prisma: PrismaClient) {
  super(prisma, 'user', {
    entityColumns: [...],
    primaryColumns: [...],
    softDeleteColumn: 'deletedAt',
    // Omit to get `new Logger(PrismaCrudService.name)` — parity with other 3 adapters.
    // Override with a custom logger only when you need non-default sinks:
    // logger: new Logger('UsersService'),
  });
}
```

**Remaining asymmetry vs other 3 adapters:** surface only (field inside `serviceConfig` vs separate positional ctor arg). Default-instantiation behavior is unified across all 4 in v2.0.0. Moving Prisma to a separate ctor parameter is a breaking change deferred to v3.

### Logger emission policy (all adapters)

- `debug` — query-build tracing (off by default in production)
- `warn` — SQLi rejection, transaction rollbacks
- `error` — uncaught DB errors before rethrow
- NEVER `info` on CRUD hot path
- **NEVER interpolate `err.message` into log strings** — DB drivers (especially TypeORM `QueryFailedError`) leak SQL with parameter values. Emit `err.name` in the message + `err.stack` as the second arg:

```ts
this.logger.error(
  `Transaction [${op}] rolled back: ${err.name}`,
  err instanceof Error ? err.stack : String(err),
);
```

### `@CrudAuth` persist key runtime validation

v1: typos in `@CrudAuth({ persist: { user_id: ... } })` (when entity column was `userId`) were silently ignored — auth-filter bypass. v2: `RequestQueryParser` validates each persist key against the entity's `entityColumnsHash` and throws `RequestQueryException` (extends `Error`; `CrudRequestInterceptor` maps to `400 Bad Request`):

```
RequestQueryException: Invalid persist key 'user_id' — not in entityColumnsHash
```

**Migration:** audit every `@CrudAuth({ persist: {...} })` against entity column names. Run pre-upgrade audit grep #11.

### Write-path transaction wrap

`updateOne` / `replaceOne` / `deleteOne` on all 4 adapters wrap their read-modify-write bodies in a transaction at **READ COMMITTED**. Closes the lost-update race window. Consumer-visible semantics unchanged for standard flows.

**Scope: these 3 ops ONLY.** `recoverOne` is EXCLUDED — plain `update({ deletedAt: null })`, no prior read, no race window.

**No retry. No consumer config knob** — if you need different isolation, `@Override()` the handler.

| Adapter | Transaction primitive |
|---|---|
| TypeORM | `QueryRunner` with scoped `Repository`; `startTransaction('READ COMMITTED')` |
| Drizzle | `db.transaction(async (tx) => ...)` + `translator.cloneFor(tx)` |
| MikroORM | `em.transactional(async (txEm) => RequestContext.create(txEm, async () => ...))` |
| Prisma | `$transaction(async (tx) => ..., { isolationLevel: 'ReadCommitted' })` |

**Transaction nesting — important for consumers who `@Override()` these ops:**
- **TypeORM:** inner QueryRunner opens a **savepoint** inside your outer tx. Commits/rollbacks cascade up.
- **Drizzle:** `db.transaction` inside outer tx creates a **savepoint** (Postgres/MySQL semantics).
- **MikroORM:** `em.transactional` inside an outer em-transaction uses **savepoint** semantics in v7.
- **Prisma:** `$transaction` inside an outer Prisma tx also creates a savepoint.
- Inner READ COMMITTED isolation is best-effort — if your outer tx set SERIALIZABLE or REPEATABLE READ, the inner call does **not** downgrade it.

### TypeORM split-query relation loading (opt-in)

New `@Crud({ query: { relationLoadStrategy: 'query' | 'join' } })` knob, default `'join'` (today's behavior). Opt into `'query'` for deep multi-relation reads where a single SQL JOIN would inflate parent rows by the cross-product of child counts:

```ts
@Crud({
  model: { type: User },
  query: {
    join: { company: { eager: false }, 'company.projects': { eager: false } },
    relationLoadStrategy: 'query',  // opts into TypeORM's setFindOptions split-query path
  },
})
```

⚠ **Footgun:** under `'query'`, `JoinOption.allow` does NOT constrain relation columns (TypeORM's `setFindOptions` doesn't expose alias-level select control). A relation declared `allow: ['name', 'domain']` returns ALL columns under `'query'` vs the expected 3 under `'join'`. If you use `allow` to hide sensitive relation columns, do NOT opt into `'query'` on those controllers.

Other adapters (Drizzle, MikroORM, Prisma) use split queries natively — this opt-in is TypeORM-only and is a no-op elsewhere.

### TypeORM cache fail-fast

If you set `@Crud({ query: { cache: 5000 } })` but forget to configure `DataSource({ cache: ... })`, v2 throws a typed error at the first cached query rather than silently no-op'ing:

```
CrudCacheNotConfiguredError: @Crud cache option requires a DataSource cache provider.
Configure DataSource({ cache: { type: 'redis', ... } }) or remove the cache option from
your @Crud() configuration.
```

The error is exported from `@nestjs-crud/core` as a plain `Error` subclass (NOT `HttpException`):

```ts
import { CrudCacheNotConfiguredError } from '@nestjs-crud/core';
```

**Fix:** either configure `DataSource({ cache: { type: 'redis' | 'database' | true, ... } })` or remove the `cache` field from your `@Crud()` decorator.

**Adapter coverage:** TypeORM only honors `@Crud({ query: { cache } })`. Drizzle, MikroORM, and Prisma do not currently honor this option — use each ORM's native caching primitives at the application layer.

### Swagger default text rewrite

v2 rewrites default Swagger/OpenAPI metadata for all 8 generated routes: imperative operation summaries, outcome-focused response descriptions, multi-line route descriptions (previously empty), auto `@ApiTags`, auto request-body examples, 400/401-if-auth/404 error emission. Runtime-additive — no code change required for consumers who don't snapshot Swagger metadata.

**Snapshot tests on operation summaries or response descriptions will drift.** Two fixes:

1. **Re-record snapshots** against v2 text (recommended — v2 copy is cleaner).
2. **Preserve v1 wording** via the new override surface:
   ```ts
   @Crud({
     model: { type: User },
     swagger: {
       operations: {
         getManyBase: { summary: 'Retrieve multiple Users' },
         // ...any subset of the 8 base routes
       },
     },
   })
   ```

**Internal `Swagger.operationsMap(modelName)` return shape changed** from `{ [k]: string }` to `{ [k]: { summary, description } }` tuples. Direct callers (rare — deep-path `@internal` API) must destructure. Prefer the stable `@Crud({ swagger: { operations: {...} } })` override surface instead; see the `nestjs-crud` skill §Swagger Customization for the full shape (`tag`, `description`, `examples`, `operations`, `errorResponses`, `synthExample`, `tagWithVersion`).

---

## §E. Packaging — engines.node + peerDependencies

- All 7 packages declare `"engines": { "node": ">=22.0.0" }`. `npm install` refuses on Node <22. Upgrade or stay on v1.0.x.
- peerDependencies declared on every adapter package (previously `@nestjs-crud/typeorm` had no peers block — consumers got zero warnings on missing `typeorm` / `@nestjs/typeorm`).

**Current peer ranges:**

- `@nestjs-crud/core`: `class-validator ^0.14.0`, `class-transformer ^0.5.0`, `@nestjs/common ^10.0.0 || ^11.0.0`
- `@nestjs-crud/typeorm`: `typeorm ^0.3`, `@nestjs/typeorm`, `@nestjs-crud/core ^2.0`, `@nestjs/common ^10.0.0 || ^11.0.0`
- `@nestjs-crud/drizzle`: `drizzle-orm >=0.45.2`, `@nestjs-crud/core ^2.0`, `@nestjs/common ^10.0.0 || ^11.0.0`
- `@nestjs-crud/mikro-orm`: `@mikro-orm/core ^7.0.0`, `@mikro-orm/knex ^7.0.0`, `@nestjs-crud/{core,request,util} ^2.0.0`, `@nestjs/common ^10.0.0 || ^11.0.0`
- `@nestjs-crud/prisma`: `@prisma/client >=5.0.0`, `@nestjs-crud/core ^2.0`, `@nestjs/common ^10.0.0 || ^11.0.0`

`@nestjs/common` peer range supports both Nest 10 and Nest 11 — pragmatic, not a forced upgrade.

---

## §F. `@nestjs-crud/prisma` — new adapter (additive)

Net-new package. Zero migration impact for existing consumers. For teams adopting Prisma, the adapter ships at parity with the other three: same 8 CrudService methods, same SCondition operator surface, same facade + 3 `@internal` pieces shape (`WhereBuilder` / `QueryComposer` / `FetchHelper`), accessible via the deep-path `@nestjs-crud/prisma/query` subpath.

### Install

```
yarn add @nestjs-crud/prisma @prisma/client
yarn add -D prisma
```

Peers: `@prisma/client: >=5.0.0`, `@nestjs-crud/core: ^2.0.0`, `@nestjs/common: ^10.0.0 || ^11.0.0`.

### Service wiring

```ts
import { Crud } from '@nestjs-crud/core';
import { PrismaCrudService } from '@nestjs-crud/prisma';
import { Injectable, Controller, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class UsersService extends PrismaCrudService<User> {
  constructor(prisma: PrismaClient) {
    super(prisma, 'user', {
      entityColumns: ['id', 'email', 'isActive', 'companyId', 'deletedAt'],
      primaryColumns: ['id'],
      softDeleteColumn: 'deletedAt',
      // Optional logger lives INSIDE serviceConfig (not a separate ctor arg).
      // Omitted → ctor auto-instantiates new Logger(PrismaCrudService.name).
      // Override only when you need non-default sinks:
      // logger: new Logger('UsersService'),
    });
  }
}

@Crud({ model: { type: User } })
@Controller('users')
export class UsersController {
  constructor(public service: UsersService) {}
}
```

### Prisma-specific behaviors

| Behavior | Consequence | Mitigation |
|---|---|---|
| **Default relation strategy is query decomposition, not SQL JOIN.** `include: { company: true }` emits parent SELECT + child SELECT with `WHERE id IN (...)`. 1 level = 2 queries; 2 levels = 4 queries. Not N+1 (queries scale with depth, not row count) but not a single JOIN either. | At scale with deep includes, latency-sensitive consumers may want native JOINs. | Opt into Prisma's `relationJoins` preview feature on your own `PrismaClient` (adapter inherits transparently). NOT forced — preview features can change without semver. |
| **`where` inside `include` rejected for to-one relations** at runtime: `Unknown argument 'where'`. Works only for to-many. | Can't filter to-one soft-delete via filtered include. | Filter at parent `where`: `where: { company: { deletedAt: null } }`. Adapter handles `?filter=company.deletedAt||$isnull` this way automatically. |
| **`include` does not auto-filter soft-deleted relations.** | Matches other adapters. | Consumer opt-in via SCondition dotted paths. |
| **`createMany` uses `$transaction([create, create, ...])` array form** for full-record return (parity with other adapters). N roundtrips. | Slower than native `createMany` but returns full records. | Acceptable — bulk create is not a CRUD hot path. |
| **Orphan relations return `null`, not 404.** | Matches other adapters' semantics. | No consumer action. |
| **`$inL` / `$notinL` use native Prisma `in` / `notIn`** — no OR/AND expansion. Performant at 5000+ id scale. | Same semantics as other adapters. | None needed. |
| **Transaction wrap pattern:** `$transaction(async (tx) => ..., { isolationLevel: 'ReadCommitted' })` on updateOne/replaceOne/deleteOne. `recoverOne` excluded. | Same contract as other adapters. | None. |

### Test / CI

CI matrix is 4 adapters × 2 DBs = **8 cells** (`typeorm` / `drizzle` / `mikro-orm` / `prisma` × `postgres` / `mysql`). Plus a 9th `parity` job and a 10th `no-swagger` sentinel. Prisma cells run `npx prisma generate --schema=packages/prisma/test/__fixture__/schema.{postgres,mysql}.prisma` before tests — two-file pattern (Prisma 5.22 rejected env-driven `provider` switching at parse time, so the adapter ships two schemas).

---

## §G. What Does NOT Change

Reassurance — these are stable across v1 → v2:

- **`@Crud()` decorator signature** — same options structure; `model`, `query`, `routes`, `params` all compatible
- **Generated endpoint paths + HTTP methods** — all 8 route handlers (`getManyBase`, `getOneBase`, `createOneBase`, `createManyBase`, `updateOneBase`, `replaceOneBase`, `deleteOneBase`, `recoverOneBase`) unchanged
- **`@Override()` decorator + `@ParsedRequest()` / `@ParsedBody()` param decorators** — stable
- **`@CrudAuth()` (`filter`, `persist`, `property`, `or`)** — stable
- **`RequestQueryBuilder` + `CondOperator` API** — stable (frontend query construction unchanged)
- **`CrudValidationGroups.CREATE` / `UPDATE`** — entity-as-DTO validation works identically
- **`CrudConfigService.load()`** — static global-defaults loader unchanged
- **Public `QueryTranslator<Q, W>` interface contract** — the 4 methods (`buildWhere`, `applyToQuery`, `count`, `findOneOrFail`) are stable across v2.x
- **`getMany` / `getOne` / `createOne` etc. return shapes** — unchanged
- **Piece interfaces (`WhereBuilder`, `QueryComposer`, `FetchHelper`)** — `@internal` in v2.0; advanced extension surface, NOT covered by semver-minor stability

If your code only uses the public surface (decorator, overrides with `@ParsedRequest`/`@ParsedBody`, query builder, validation groups), migration is mostly: audit column references in query params, then bump the version.

---

## Common Upgrade Errors & Fixes

| Error / symptom | Cause | Fix |
|---|---|---|
| `BadRequestException: Field "X" is not allowed` | Field not in `entityColumnsHash` | Add `@Column()` / register as entity column, or remove from query param |
| `BadRequestException: Relation "Y" is not allowed` | Dotted path with unknown relation | Add `?join=Y` to request AND register in `@Crud({ query: { join: { Y: {} } } })` |
| `TypeError: this.checkSqlInjection is not a function` | Subclass called deleted private | Call `this.sanitizer.assert(field)` instead |
| `TypeError: this.setSearchCondition is not a function` | Subclass called deleted protected | Override `TypeOrmQueryTranslator.buildWhere` in a custom translator |
| `TypeError: this.mapSort is not a function` / `this.getFieldWithAlias is not a function` / `this.getSort is not a function` | Subclass called deleted helper | Override `TypeOrmQueryComposer` sort logic via a custom translator (composer is `@internal` — deep-path import) |
| `TypeError: this.translator.count is not a function` | Custom `QueryTranslator<Q, W>` implementation missing `count()` | Add `count(qb: Q): Promise<number>` — for TypeORM, `return qb.getCount()` |
| `TypeError: this.translator.findOneOrFail is not a function` | Custom translator missing `findOneOrFail()` | Add `findOneOrFail(qb, opts)` — see `TypeOrmQueryTranslator` source for reference impl |
| `Cannot read properties of undefined (reading 'entityRelationsHash')` | Accessed field that moved to resolver | Hash is now per-`TypeOrmJoinResolver` instance; access via `this.joinResolver` |
| `Error: Cannot find module '@nestjs-crud/core/query/...'` | Tried to import `@internal` piece interfaces that aren't resolved by your tooling | The pieces are exported only via the `@nestjs-crud/core/query` subpath; ensure your bundler/resolver supports Node subpath resolution. These interfaces are `@internal` — pin exact versions if you depend on them |
| MikroORM: stale entity from previous request returned; `em.flush()` doesn't persist | Subclass cached `em` at ctor time; request-scope bypass | Replace captured `em` field with `this.getEm()` call inside every method that needs it |
| MikroORM Jest fails: `SyntaxError: Unexpected token 'export'` / `import.meta outside a module` | Running MikroORM specs without the ESM preset | Use `yarn test:mikro-orm` (has `NODE_OPTIONS=--experimental-vm-modules` inline) — NOT `npx jest` directly |
| TS: `Argument of type 'any' is not assignable to parameter of type 'X'` after bump | MikroORM type tightening | Add explicit type annotation (`FilterQuery<T>`, `RequiredEntityData<T>`, `EntityMetadata<T>`, `QueryOrderMap<T>`); most fixes one-line |
| TS: `Type 'any' is not assignable to type 'DrizzleClient'` on Drizzle subclass field | `protected db: any` → `DrizzleClient` | Remove the `protected db: any` re-declaration in your subclass; inherit the typed field from the base |
| TS: `Cannot find module '@nestjs/swagger/dist/types/swagger-enum.type'` | `SwaggerEnumType` import removed | Stop importing from the internal path; inline the type locally as `string[] \| number[] \| (string \| number)[] \| Record<number, string>` |
| `RequestQueryException: Invalid persist key 'X'` (maps to 400 Bad Request) | `@CrudAuth({ persist: { ... } })` has a typo that doesn't match any entity column | Fix the key name to match the entity column exactly. v1 silently ignored this, leaving auth-filter bypass; v2 fails fast |
| `CrudCacheNotConfiguredError` thrown on first cached read | `@Crud({ query: { cache } })` set but `DataSource({ cache: ... })` not configured | Configure DataSource cache provider OR remove `@Crud cache` option |
| `@Crud({ query: { cache } })` silently does nothing on Drizzle/MikroORM/Prisma | Adapter doesn't honor the option — only TypeORM does | Use the ORM's native caching at the application layer; or move the cached read to a TypeORM-backed controller |
| Relation columns under `'query'` strategy include columns NOT in `JoinOption.allow` | Documented divergence — `setFindOptions` doesn't expose alias-level select control | Either keep `'join'` strategy on those controllers, or audit every relation explicitly. See §D — TypeORM split-query relation loading |
| Prisma service now emits logs when it didn't before | Phase 15 unified Prisma's default with the other 3 adapters — omitting `serviceConfig.logger` now auto-instantiates `new Logger(PrismaCrudService.name)`, not silent no-op | If you relied on silent behavior: pass an explicit no-op logger (`{ error: () => {}, warn: () => {}, debug: () => {} }`) via `serviceConfig.logger`. See §D — Optional logger Prisma |
| `Property 'summary' does not exist on type 'string'` on `Swagger.operationsMap(...)` | Internal API shape changed — `string` → `{ summary, description }` tuples | Destructure, or switch to the stable `@Crud({ swagger: { operations: {...} } })` override surface (see `nestjs-crud` skill §Swagger Customization) |
| Swagger snapshot tests fail after upgrade | v2 rewrites default operation summaries + response descriptions (imperative + outcome-focused form) | Re-record snapshots, OR pin v1 wording via `@Crud({ swagger: { operations: {...} } })` (see §D — Swagger) |
| Unexpected SERIALIZABLE isolation inside your outer tx, or rollback cascading unexpectedly | Consumer `@Override()` wraps updateOne/replaceOne/deleteOne in an outer transaction; adapter now adds an inner savepoint at READ COMMITTED | Decide intent: either remove the outer wrap, or accept savepoint nesting semantics |
| `Class 'X' incorrectly implements interface 'QueryTranslator<Q, W>'. Missing: count, findOneOrFail` | Custom translator from pre-v2 code | Add the two methods to your implementation |
| npm install warnings about missing peer: `typeorm`, `@nestjs/typeorm`, `@nestjs/common` | peerDeps audit landed in v2 | Install the peers explicitly: `yarn add typeorm @nestjs/typeorm @nestjs/common` (or the relevant adapter's peers) |
| `EBADENGINE: Unsupported engine` (Node <22) on `npm install` | `engines.node: ">=22.0.0"` on all 7 packages | Upgrade Node to 22.x, or stay on v1.0.x |
| Prisma: `Unknown argument 'where'` on `include: { company: { where: {...} } }` | Prisma rejects `where` inside `include` for to-one relations | Filter at parent `where`: `{ where: { company: { ... } } }`. Use filtered `include` only for to-many. Adapter does this automatically for SCondition dotted paths on to-one |
| Prisma: deep `include` query is slower than expected / emits multiple SELECTs | Prisma default is query decomposition, not SQL JOIN (1 + N_depth queries) | Opt into Prisma's `relationJoins` preview feature on your own `PrismaClient` (adapter inherits transparently). Not forced by library |
| Prisma: `createMany` returns fewer fields than TypeORM equivalent / missing DB-assigned ids | Prisma native `createMany` returns `{ count }` only; adapter uses `$transaction([create, ...])` array form for parity | No action — this is already the library's default. If you see the v1 behavior, verify you're on v2 |

## Not Sure If Affected?

Run the Pre-Upgrade Audit greps at the top of this skill.

- Zero hits on (2)/(3)/(4)/(5)/(6)/(7)/(8)/(9)/(10) → you're only in §A territory (allowlist audit)
- Non-zero on (2) → standard subclass method migration (§B deleted methods)
- Non-zero on (3) → custom `QueryTranslator` — must implement `count()` + `findOneOrFail()`
- Non-zero on (4) → MikroORM consumer, audit for stale-em risk (§B `getEm` thunk)
- Non-zero on (5) → runtime mutation of deleted fields — re-implement via the new interfaces
- Non-zero on (6) → subclass override on a method whose shape changed — audit against the v2 source
- Non-zero on (7) → Drizzle subclass typing `protected db: any` — type tightening (§C)
- Non-zero on (8) → MikroORM subclass override on public method — audit returns for typed generics (§C)
- Non-zero on (9) → one-line Swagger internal import swap (§C)
- Non-zero on (10) → consumer `@Override()` on updateOne/replaceOne/deleteOne — audit transaction nesting (§D)
- Non-zero on (11) with typos in persist keys → expect `RequestQueryException` at runtime (§D)
- Non-zero on (12) without DataSource cache configured → expect `CrudCacheNotConfiguredError` at runtime (§D)
- (13) failing → upgrade Node to 22.x or stay on v1.0.x (§E)

---

## v2.0 → v2.1 (Prisma v7)

`@nestjs-crud/prisma@2.1.0` narrows the `@prisma/client` peer range from `>=5.0.0` to `^7.0.0`. Adapter runtime API is **unchanged** — subclasses compile and run against Prisma 7 without code changes. All migration work is in schema files + CLI invocations + the `PrismaClient` constructor call. The other six `@nestjs-crud/*` packages republish at `2.1.0` with no behavior change.

**Canonical walkthrough:** [`docs/wiki/v2.1-Migration.md`](https://github.com/kodjunkie/nestjs-crud/wiki/v2.1-Migration). Use it as the consumer-facing playbook; this skill section is a triage summary for agents.

### Pre-upgrade audit (Prisma consumers only)

```bash
# 1. schema.prisma still carries `url = env("DATABASE_URL")` — v7 rejects it
grep -rnE 'url\s*=\s*env\("DATABASE_URL"\)' . --include='*.prisma'

# 2. CI / scripts / Dockerfiles pass the hard-removed --skip-generate flag
grep -rn "skip-generate" . --include='*.json' --include='*.yml' --include='*.yaml' \
                           --include='Dockerfile*' --include='*.sh'

# 3. PrismaClient constructor relies on env-auto or datasourceUrl (all three patterns throw on v7)
grep -rnE "new PrismaClient\(\s*\)|datasourceUrl|datasources:\s*\{\s*db:" src/

# 4. Postgres on a non-public schema — adapter-pg does NOT emit SET search_path
grep -rn '\?schema=' . --include='*.env*' --include='*.ts' --include='*.js'

# 5. MySQL teardown relies on session-scoped SET persisting across statements
grep -rnE "FOREIGN_KEY_CHECKS|SET SESSION|SET @" src/ test/
```

### Triage table

| Symptom | Cause | Fix |
|---|---|---|
| `prisma generate`: `The property url on the datasource block is not allowed` | v5-shaped schema on v7 | Drop `url = env("DATABASE_URL")` from every `datasource` block (wiki §1) |
| `prisma db push`: `The datasource.url property is required in your Prisma config file` | `prisma.config.ts` missing or lacks `datasource.url` | Add `prisma.config.ts` at project root forwarding `DATABASE_URL` into `datasource.url` (wiki §2) |
| `prisma db push`: `Unknown argument '--skip-generate'` | v7 hard-removed the flag (not documented upstream as removed) | Drop the flag from every `prisma db push` invocation; `db push` auto-generates now (wiki §3) |
| `new PrismaClient()` throws: `Your Prisma Client was configured with datasourceUrl, but the datasource in schema.prisma does not expose a URL` | v7 rejects `datasourceUrl` / `datasources.db.url` against v7-shaped schemas and no longer reads env implicitly | Wire a driver adapter: `new PrismaClient({ adapter: new PrismaPg({ connectionString }) })` for Postgres, `new PrismaMariaDb(url)` for MySQL (wiki §4) |
| Postgres: tables land in `public` despite `?schema=custom`; `relation does not exist` on known tables; raw-SQL `ALTER SEQUENCE` fails | `@prisma/adapter-pg` does NOT run `SET search_path` on connect (NOT documented upstream) | Pass libpq `options=-c search_path=<schema>` in pg `PoolConfig` AND pass `schema` as the second `PrismaPg` arg (wiki gotcha 1) |
| MySQL: `SET FOREIGN_KEY_CHECKS = 0; TRUNCATE ...` fails on FK; `SET @x = 1; SELECT @x` returns `NULL`; sql_mode / time_zone drift | `@prisma/adapter-mariadb` dispatches each call on a fresh pool checkout — session-scoped `SET` does NOT persist (NOT documented upstream) | Refactor to dependency-ordered `DELETE FROM` + `ALTER TABLE ... AUTO_INCREMENT = 1` for teardown; use mariadb pool's `initSql` to replay required `SET SESSION` on connect (wiki gotcha 2) |

### What does NOT change

- `PrismaCrudService<T>` constructor, method signatures, internal composition — identical.
- `@Crud()` decorator, `@Override()`, `@ParsedRequest()` — identical.
- Serialization, validation, transaction semantics on `updateOne` / `replaceOne` / `deleteOne` — identical.

If the consumer is not maintaining a `schema.prisma` (generated-only, already on a driver adapter, already on `@prisma/client@^7`), the 2.1.0 bump is a metadata-only peer-range narrowing.

### Stay-on-v2.0 escape

Pin `"@nestjs-crud/prisma": "^2.0.0"` + `"@prisma/client": "^5 || ^6"`. No `v2.0-lts` dist-tag — `latest` flips to `2.1.0`.
