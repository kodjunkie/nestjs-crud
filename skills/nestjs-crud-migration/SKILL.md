---
name: nestjs-crud-migration
description: Use when migrating a NestJS project from @nestjs-crud/* v1.0.x to v2.0, diagnosing v2 upgrade errors (`Field "X" is not allowed`, `setSearchCondition is not a function`, `checkSqlInjection is not a function`, `entityRelationsHash` undefined, `translator.count is not a function`, `findOneOrFail is not a function`, `RequestQueryException: Invalid persist key`, Drizzle `Type 'any' is not assignable to type 'DrizzleClient'`, MikroORM `FilterQuery<T>` type errors, MikroORM stale-em identity-map issues, Prisma `Unknown argument 'where'` inside include, `engines.node` install refusal), adopting `@nestjs-crud/prisma`, or planning a v2 upgrade before npm publish ships.
---

# @nestjs-crud v1 → v2 Migration

## Status

**v2.0.0 is a coordinated breaking release** currently being built on the `dev` branch. Not yet published to npm. This skill covers:

- **LANDED:** breaking changes already committed on `dev` (Phases 3–6.2)
- **PLANNED:** breaking changes coming in Phases 7–11 before v2 ships (flagged explicitly)

**If you can't migrate yet:** pin to `^1.0.2`. The v1.0.x line continues to receive bugfix patches on the `v1.0.2` branch.

**Progress (as of 2026-04-22):** Phases 3 (ARCH-01), 4 (ARCH-02/03), 5 (ARCH-04 slim), 6.1 (MikroORM ESM export fix), 6.1.1 (MikroORM import.meta ESM), 6 (ARCH-05 alignment + REFACTOR-01 integration decouple), 6.2 (translator decomposition), 7 (real-DB tests + CI matrix), 8 (breaking types + logger + security), and 9 (`@nestjs-crud/prisma` adapter) all landed on `dev`. Phase 10 (performance + coverage) and Phase 11 (docs + release) pending.

## Pre-Upgrade Audit — Run These Greps First

Before bumping to v2, search your codebase for anything that will break:

```bash
# 1. Query params with fields that may not be in entityColumnsHash
#    (sort=, filter=, search=, fields=, join=) — LANDED breakage
grep -rE "sort=|filter=|search=|fields=" src/ test/

# 2. Services subclassing @nestjs-crud adapters and overriding deleted internals
#    Any of these method overrides break — see §B
grep -rE "(setSearchCondition|setAndWhere|setOrWhere|setJoin|getRelationMetadata|checkSqlInjection|mapSort|getFieldWithAlias|getSort)\s*\(" src/

# 3. Custom translators / services affected by Phase 6 interface amend
#    Custom QueryTranslator implementations need count() + findOneOrFail()
grep -rE "implements QueryTranslator<|extends TypeOrmQueryTranslator" src/

# 4. MikroORM subclass overrides that might cache em (T-06-02 risk)
grep -rE "this\.em\s*=|private\s+(readonly)?\s*em:\s*EntityManager" src/

# 5. Runtime mutation of deleted fields
grep -rE "\.(sqlInjectionRegEx|entityRelationsHash)\s*=" src/

# 6. doGetMany / createBuilder subclass overrides (shape changed in Phase 5/6)
grep -rE "(doGetMany|createBuilder|prepareEntityBeforeSave|getSelect)\s*\(" src/

# 7. Usage of pre-v2 deprecated surfaces (already @deprecated in v1.0.2)
grep -rE "ParamOption\.enum|DrizzleCrudService.*\.db" src/

# 8. Drizzle subclasses typing `protected db: any` — TYPES-01 break (Phase 8)
grep -rE "protected\s+db\s*:\s*any|extends\s+DrizzleCrudService" src/

# 9. MikroORM subclasses overriding public methods (TYPES-02 tightens return types)
grep -rE "extends\s+MikroOrmCrudService|override\s+(getMany|getOne|createOne|createMany|updateOne|replaceOne|deleteOne|recoverOne)" src/

# 10. Internal Swagger import — TYPES-05 break (Phase 8)
grep -rE "from\s+['\"]@nestjs/swagger/dist/types/swagger-enum\.type['\"]|SwaggerEnumType" src/

# 11. Consumer @Override() on updateOne/replaceOne/deleteOne — SEC-03 transaction-nesting audit (Phase 8)
#     Inner adapter tx creates a savepoint if consumer already opened one — verify nesting is intended
grep -rE "@Override\(\)\s*(async\s+)?(updateOne|replaceOne|deleteOne)" src/

# 12. Runtime @CrudAuth persist key usage — SEC-02 now throws on typos (Phase 8)
grep -rE "@CrudAuth|CrudAuth\s*\(\s*\{" src/

# 13. Node version — engines.node now ">=22.0.0" (Phase 8 BUILD-01)
node --version  # must be >=22; else install will refuse
```

Non-zero results from (1) = allowlist audit (§A). Non-zero from (2)/(3)/(4)/(5)/(6)/(8)/(9) = subclass migration work (§B/§E). Non-zero from (10) = one-line import swap (§E.TYPES-05). Non-zero from (11) = audit transaction-nesting semantics before upgrade (§E.SEC-03). Non-zero from (12) with any typo in `persist` keys = expect new `RequestQueryException` at runtime (§E.SEC-02). (13) failing = either upgrade Node or stay on v1.0.x.

## Quick Reference — What Breaks

| Area | Phase | Status | Impact |
|------|-------|--------|--------|
| **Strict column-name allowlist** | ARCH-03 | LANDED | High — hits any consumer with typos, virtual columns, or dotted paths |
| **Deleted internal service methods** (setSearchCondition, setAndWhere, setOrWhere, setJoin, getRelationMetadata) | ARCH-01/02 | LANDED | Medium — subclass-override consumers only |
| **InputSanitizer replaces `checkSqlInjection`** + `sqlInjectionRegEx` deletion | ARCH-03 | LANDED | Medium — same audience |
| **`mapSort` / `getFieldWithAlias` / `getSort` deleted from service** (moved to translator) | ARCH-04 | LANDED | Medium — subclass-override consumers |
| **`TypeOrmQueryTranslator` ctor signature → config-object** `(repo, { entityColumnsHash, entityHasDeleteColumn, onBadRequest, joinResolver })` | ARCH-04 | LANDED | Medium — custom translator consumers |
| **`findOneOrFail` added to `QueryTranslator<Q,W>` interface** | ARCH-04 | LANDED | Medium — custom translator must implement |
| **`count(qb): Promise<number>` added to `QueryTranslator<Q,W>` interface** | ARCH-05 | LANDED | Medium — custom translator must implement; otherwise `translator.count is not a function` |
| **Drizzle + MikroORM service ctors → config-object pattern** (same shape as TypeORM) | ARCH-05 | LANDED | Medium — custom adapter subclasses |
| **MikroORM `getMany` internal shape** (`em.findAndCount` → QueryBuilder path) | ARCH-05 | LANDED | Low — external return shape unchanged; subclass overrides of `getMany` body break |
| **MikroORM FetchHelper `getEm: () => EntityManager` thunk contract** (T-06-02) | ARCH-05 | LANDED | Medium — consumers who cache `em` across calls reintroduce cross-request identity-map bug |
| **Translator decomposition — `@internal` `WhereBuilder` / `QueryComposer` / `FetchHelper` pieces** | Phase 6.2 | LANDED | Low — public `QueryTranslator<Q,W>` contract unchanged; subclass customization now also possible via pieces (advanced, `@internal`) |
| **`integration/typeorm/` deleted** (moved to `packages/typeorm/test/__fixture__/app/`; new `examples/typeorm-demo/` for demos) | REFACTOR-01 | LANDED | None for consumers; affects only contributors pointing at old paths |
| **MikroORM Jest ESM config** (per-package `jest.config.js` + `NODE_OPTIONS=--experimental-vm-modules`) | Phase 6.1/6.1.1 | LANDED | None for consumers; affects contributors running `npx jest` on MikroORM specs — use `yarn test:mikro-orm` |
| **Drizzle `protected db: DrizzleClient`** (was `any`) | TYPES-01 | LANDED (Phase 8) | Medium — subclasses typing `protected db: any` now conflict with the base; see §E.TYPES-01 |
| **MikroORM public method signatures typed** (15 `any` sites → `EntityMetadata<T>` / `FilterQuery<T>` / `RequiredEntityData<T>` / `QueryOrderMap<T>`) | TYPES-02 | LANDED (Phase 8) | Medium — subclasses relying on `any` permissiveness now get compile errors |
| **`SwaggerEnumType` inlined** (no more `@nestjs/swagger/dist/types/swagger-enum.type` import) | TYPES-05 | LANDED (Phase 8) | Low — one-line swap if you imported the internal path |
| **Optional `logger?: LoggerService` on adapter ctors** (service-level only; `@internal` pieces stay pure) | OBS-01 | LANDED (Phase 8) | None — additive, opt-in; default `new Logger(<class-name>)` |
| **`@CrudAuth` persist key runtime validation** — throws `RequestQueryException` on unknown keys | SEC-02 | LANDED (Phase 8) | Medium — previously-silent typos now fail fast at runtime (auth-filter bypass closed) |
| **SEC-03 transaction wrap on `updateOne` / `replaceOne` / `deleteOne`** — per adapter: TypeORM `QueryRunner`; Drizzle `translator.cloneFor(tx)`; MikroORM `RequestContext.create(txEm, ...)`. READ COMMITTED hardcoded; NO retry | SEC-03 | LANDED (Phase 8) | Low for standard consumers; medium for consumers with outer transactions or custom `@Override()` on these ops — audit nesting semantics (§E.SEC-03) |
| **`recoverOne` EXCLUDED from SEC-03** (plain `update(...)`; no read-modify-write race) | SEC-03 | LANDED (Phase 8) | None — documented behavior |
| **`engines.node: ">=22.0.0"`** in all 6 packages | BUILD-01 | LANDED (Phase 8) | Low — `npm install` refuses on older Node |
| **peerDependencies declared on all packages** (typeorm pkg gains full block; drizzle/core gain `@nestjs-crud/core` + `@nestjs/common`; mikro-orm core peer `>=6.0.0`) | BUILD-01 | LANDED (Phase 8) | Low — `npm install` warns if peers missing. ⚠ Known bug: peers declare `@nestjs/common: ^10.0.0` but root uses v11 (backlog item 999.4 tracks the fix) |
| **`@nestjs-crud/prisma` new adapter package** (Prisma 5+) | ADAPTER-01 | LANDED (Phase 9) | None for existing consumers — additive; see §F for install + Prisma-specific behaviors |

---

## §A. Strict Column-Name Allowlist (ARCH-03) — LANDED

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
- **Relation-qualified dotted paths** (`?sort=author.name`) — require the relation to be explicitly joined via `?join=author` AND registered in `@Crud({ query: { join: {...} } })`. Enforced via `joinResolver.getAllowedColumnsFor(relation)` in the QueryComposer (Phase 6.2) — unknown relations throw before reaching SQL.

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

## §B. Deleted Service Internals + Interface Changes — LANDED

Affects **consumers who subclass `TypeOrmCrudService` / `DrizzleCrudService` / `MikroOrmCrudService` and override protected/private internals, OR consumers with custom `QueryTranslator<Q, W>` implementations.** Standard usage (just extending the class and wiring it to NestJS DI) is unaffected.

### Deleted protected/private service methods (Phase 3–5)

| Surface | v1 location | v2 status | Replacement |
|---|---|---|---|
| `setSearchCondition(builder, search)` | `TypeOrmCrudService` protected | Deleted (`44d403c`) | `TypeOrmQueryTranslator.buildWhere` |
| `setAndWhere(cond, i, builder)` | `TypeOrmCrudService` protected | Deleted (`44d403c`) | Absorbed into translator |
| `setOrWhere(cond, i, builder)` | `TypeOrmCrudService` protected | Deleted (`44d403c`) | Absorbed into translator |
| `setJoin(cond, joinOptions, builder)` | `TypeOrmCrudService` protected | Deleted (`7cc5c4c`) | `TypeOrmJoinResolver.applyJoins` |
| `getRelationMetadata(field, options)` | `TypeOrmCrudService` protected | Deleted (`7cc5c4c`) | `TypeOrmJoinResolver` internal |
| `checkSqlInjection(field)` | all 3 adapters, private | Deleted (`31d2edf`, `6762ce9`) | `InputSanitizer.assert(field)` |
| `mapSort(sort)` | `TypeOrmCrudService` protected | Deleted (Phase 5) | `TypeOrmQueryComposer` (internal piece, Phase 6.2) — override via custom translator's composer |
| `getFieldWithAlias(field, sort)` | `TypeOrmCrudService` protected | Deleted (Phase 5) | `TypeOrmQueryComposer` internal |
| `getSort()` | `TypeOrmCrudService` protected | Deleted (Phase 5) | `TypeOrmQueryComposer` internal |
| `prepareEntityBeforeSave(dto, parsed)` | `TypeOrmCrudService` protected | Retained as 1-line delegator (Phase 5) | `@nestjs-crud/core/util/prepare-entity-before-save` pure util |
| `getSelect(query, options)` | `TypeOrmCrudService` protected | Retained as 1-line delegator (Phase 5) | `@nestjs-crud/core/util/get-select` pure util |
| `findOneOrFail(req, shallow, withDeleted)` | `TypeOrmCrudService` protected | Retained as 1-line delegator (Phase 5 Plan 06.5) | `TypeOrmQueryTranslator.findOneOrFail` — override on translator |

### Deleted fields

| Field | v1 location | v2 status |
|---|---|---|
| `sqlInjectionRegEx` | all 3 adapters | Deleted — no equivalent (denylist fallback removed entirely) |
| `entityRelationsHash` | `TypeOrmCrudService` protected | Moved onto `TypeOrmJoinResolver` instance |

### Interface contract changes (Phase 3–6)

Custom `QueryTranslator<Q, W>` implementations must implement the following methods that v2 adds/enforces. Consumers who `implements QueryTranslator<X, Y>` get TypeScript errors until they add these:

| Method | Added | Contract |
|---|---|---|
| `buildWhere(search: SCondition): W` | Phase 3 | Returns the ORM's predicate type |
| `applyToQuery(qb: Q, parsed: ParsedRequestParams, options: CrudRequestOptions): Q` | Phase 3 / expanded in Phase 5 | Applies WHERE + sort + pagination + field selection + soft-delete + eager joins |
| `findOneOrFail(qb: Q, opts: FindOneOrFailOptions): Promise<T>` | Phase 5 (Plan 06.5 lift) | Executes a prepared query; throws if no result |
| `count(qb: Q): Promise<number>` | Phase 6 Plan 02 | Returns row count for the query (`qb.getCount()` in TypeORM; `sql\`count(*)\`` in Drizzle; `qb.getCount()` in MikroORM) |

### Adapter service ctor changes (Phase 6)

All three adapter services now use the config-object ctor pattern. Custom subclasses that reached into protected/private state via `as unknown as` casts break:

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

### MikroORM `getEm: () => EntityManager` thunk contract — T-06-02

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

### Phase 6.2 `@internal` piece interfaces — advanced extension surface

Phase 6.2 decomposed each adapter's translator into 3 internal pieces: `WhereBuilder<Q, W>`, `QueryComposer<Q>`, `FetchHelper<Q>`. These live in `@nestjs-crud/core/query` (deep-path only — NOT in the main `@nestjs-crud/core` barrel) and are marked `@internal` via JSDoc. The D-05b SQLi allowlist guard now lives inside each adapter's `QueryComposer`, not on the translator class directly.

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
    // custom logic or super.buildWhere(search)
    return super.buildWhere(search);
  }
  // count() and findOneOrFail() inherited from parent — don't need to re-implement
  // unless customizing
}
```

---

## §C. Remaining Planned Changes (Phase 10, 11)

These are the only phases still outstanding before v2.0.0 ships. Skill will be updated as they complete.

- **Phase 10 (PERF-01/02 + CI-03 + COVERAGE-01 remainder):**
  - `PERF-01`: split-query joins / DataLoader fallback for deep `join=` with `getManyAndCount` (TypeORM first; may extend).
  - `PERF-02`: documented TypeORM `cache:` wiring with fail-fast on missing provider. The Redis service in `compose.yml` (inherited from upstream fork; currently vestigial) gets wired here.
  - `CI-03`: Swagger-less CI matrix cell to exercise `safeRequire` null path.
  - `COVERAGE-01 (remainder)`: remove remaining `/* istanbul ignore */` pragmas (9 deleted in Phase 5); enforce a coverage threshold.
  - **Consumer impact:** additive — faster deep-join queries if opted in; no breaking change expected.
- **Phase 11 (DOCS-01/03/04/07 + RELEASE-03):** Migration guide, Wiki, package READMEs, ship v2.0.0. Final Wiki migration guide supersedes this skill.

---

## §E. Phase 8 Breaking Surfaces — LANDED

Five workstreams shipped together: type tightening (TYPES-01/02/05), optional logger (OBS-01), runtime validation (SEC-02), transaction wrapping (SEC-03), packaging hygiene (BUILD-01).

### TYPES-01 — Drizzle `protected db: DrizzleClient`

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

### TYPES-02 — MikroORM public method signatures typed

15 `any` sites replaced with typed generics from `@mikro-orm/core`: `EntityMetadata<T>`, `FilterQuery<T>`, `RequiredEntityData<T>`, `QueryOrderMap<T>`. Subclasses that relied on `any` permissiveness get compile errors until callsites are annotated.

### TYPES-05 — `SwaggerEnumType` inlined

v1 imported `SwaggerEnumType` from `@nestjs/swagger/dist/types/swagger-enum.type` (internal path). v2 inlines it at `packages/core/src/interfaces/params-options.interface.ts` as `string[] | number[] | (string | number)[] | Record<number, string>`. One-line swap for consumers who imported the same internal path.

### OBS-01 — Optional logger injection

All three adapter services now accept `logger?: LoggerService` as an optional positional ctor argument. Default: `new Logger(this.constructor.name)` when omitted. `@internal` pieces do NOT receive logger — stay pure.

**Emission policy (load-bearing for migration):**
- `debug` — query-build tracing (off by default in production)
- `warn` — SQLi rejection (`onBadRequest` triggers), SEC-03 tx rollbacks
- `error` — uncaught DB errors before rethrow
- NEVER `info` on CRUD hot path
- **NEVER interpolate `err.message` into log strings** — DB drivers (especially TypeORM `QueryFailedError`) leak SQL with parameter values. Emit `err.name` in the message + `err.stack` as the second arg:

```ts
this.logger.error(
  `Transaction [${op}] rolled back: ${err.name}`,
  err instanceof Error ? err.stack : String(err),
);
```

Additive only — no migration required.

### SEC-02 — `@CrudAuth` persist key runtime validation

v1: typos in `@CrudAuth({ persist: { user_id: ... } })` (when entity column was `userId`) were silently ignored — auth-filter bypass. v2: `RequestQueryParser` validates each persist key against the entity's `entityColumnsHash` and throws `RequestQueryException` (extends `Error`; `CrudRequestInterceptor` maps to `400 Bad Request`):

```
RequestQueryException: Invalid persist key 'user_id' — not in entityColumnsHash
```

**Migration:** audit every `@CrudAuth({ persist: {...} })` against entity column names. Run Pre-Upgrade Audit grep #12.

### SEC-03 — Transaction wrapping (per-adapter)

`updateOne` / `replaceOne` / `deleteOne` on all three adapters wrap their read-modify-write bodies in a transaction at **READ COMMITTED**. Closes the lost-update race discovered in Phase 1 `P1-T6`.

**Scope: these 3 ops ONLY.** `recoverOne` is EXCLUDED — plain `update({ deletedAt: null })`, no prior read, no race window.

**No retry. No consumer config knob** — if you need different isolation, `@Override()` the handler.

**Per-adapter implementation:**

| Adapter | Transaction primitive | Notes |
|---|---|---|
| TypeORM | `QueryRunner` with scoped `Repository` | `startTransaction('READ COMMITTED')` + try/catch/finally with commit/rollback/release |
| Drizzle | `db.transaction(async (tx) => ...)` + `translator.cloneFor(tx)` | Translator rebuilds its pieces bound to `tx`; service uses `scopedTranslator` for all writes. Direct `tx.update/insert/delete` in the service is forbidden by design |
| MikroORM | `em.transactional(async (txEm) => RequestContext.create(txEm, async () => ...))` | `RequestContext.create` swaps the request-scoped em for the duration; `getEm` thunk auto-resolves to `txEm` inside. Thunk contract unchanged from Phase 6.2 T-06-02 |

**Transaction nesting — important for consumers who `@Override()` these ops:**
- **TypeORM:** inner QueryRunner opens a **savepoint** inside your outer tx. Commits/rollbacks cascade up.
- **Drizzle:** `db.transaction` inside outer tx creates a **savepoint** (Postgres/MySQL semantics).
- **MikroORM:** `em.transactional` inside an outer em-transaction uses **savepoint** semantics in v7.
- Inner READ COMMITTED isolation is best-effort — if your outer tx set SERIALIZABLE or REPEATABLE READ, the inner call does **not** downgrade it.

### BUILD-01 — `engines.node` + peerDependencies

- All 6 packages declare `"engines": { "node": ">=22.0.0" }`. `npm install` refuses on Node <22. Upgrade or stay on v1.0.x.
- peerDependencies declared on every adapter package (previously `@nestjs-crud/typeorm` had no peers block — consumers got zero warnings on missing `typeorm` / `@nestjs/typeorm`).
- ⚠ **Known bug** (backlog item 999.4): peers declare `@nestjs/common: ^10.0.0` but the repo's own devDeps use `@nestjs/common: ^11.1.13`. Consumers on NestJS 11 see a non-blocking peer warning. Scheduled for correction before v2.0.0 ships. Intended targets once fixed: `@nestjs/common: ^11.0.0`, `@nestjs/typeorm: ^11.0.0`, `@mikro-orm/core: >=7.0.0`, `@nestjs-crud/{request,util}: ^2.0.0`, `class-transformer: ^0.5.0`, `class-validator: ^0.14.0`.

---

## §F. Phase 9 — `@nestjs-crud/prisma` (new adapter, additive)

Net-new package. Zero migration impact for existing consumers. For teams adopting Prisma, the adapter ships at parity with the other three: same 8 CrudService methods, same SCondition operator surface, same facade + 3 `@internal` pieces shape (`WhereBuilder` / `QueryComposer` / `FetchHelper`), accessible via the deep-path `@nestjs-crud/prisma/query` subpath.

### Install

```
yarn add @nestjs-crud/prisma @prisma/client
yarn add -D prisma
```

Peers: `@prisma/client: >=5.0.0`, `@nestjs-crud/core: ^2.0.0`, `@nestjs/common: ^11.0.0`.

### Service wiring

```ts
import { Crud } from '@nestjs-crud/core';
import { PrismaCrudService } from '@nestjs-crud/prisma';
import { Injectable, Controller } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class UsersService extends PrismaCrudService<User> {
  constructor(prisma: PrismaClient) {
    super(prisma, 'user', { entityColumns, primaryColumns, softDeleteColumn: 'deletedAt' });
  }
}

@Crud({ model: { type: User } })
@Controller('users')
export class UsersController {
  constructor(public service: UsersService) {}
}
```

### Prisma-specific behaviors (from Phase 9 spike findings — load-bearing for consumers)

| Behavior | Consequence | Mitigation |
|---|---|---|
| **Default relation strategy is query decomposition, not SQL JOIN.** `include: { company: true }` emits parent SELECT + child SELECT with `WHERE id IN (...)`. 1 level = 2 queries; 2 levels = 4 queries. Not N+1 (queries scale with depth, not row count) but not a single JOIN either. | At scale with deep includes, latency-sensitive consumers may want native JOINs. | Opt into Prisma's `relationJoins` preview feature on your own `PrismaClient` (adapter inherits transparently). NOT forced — preview features can change without semver. |
| **`where` inside `include` rejected for to-one relations** at runtime: `Unknown argument 'where'`. Works only for to-many. | Can't filter to-one soft-delete via filtered include. | Filter at parent `where`: `where: { company: { deletedAt: null } }`. Adapter handles `?filter=company.deletedAt||$isnull` this way automatically. |
| **`include` does not auto-filter soft-deleted relations.** | Matches other adapters. | Consumer opt-in via SCondition dotted paths. |
| **`createMany` uses `$transaction([create, create, ...])` array form** for full-record return (parity with other adapters). N roundtrips. | Slower than native `createMany` but returns full records. | Acceptable — bulk create is not a CRUD hot path. |
| **Orphan relations return `null`, not 404.** | Matches other adapters' semantics. | No consumer action. |
| **`$inL` / `$notinL` use native Prisma `in` / `notIn`** — no OR/AND expansion. Performant at 5000+ id scale (spike-verified: 28ms for 5000-id notIn on 10000 rows). | Same semantics as other adapters. | None needed. |
| **SEC-03 pattern:** `$transaction(async (tx) => ..., { isolationLevel: 'ReadCommitted' })` on updateOne/replaceOne/deleteOne. `recoverOne` EXCLUDED (matches Phase 8). | Same contract as Phase 8 SEC-03. | None. |

### Test / CI

CI matrix now 4 adapters × 2 DBs = **8 cells** (`typeorm` / `drizzle` / `mikro-orm` / `prisma` × `postgres` / `mysql`). Prisma cells run `npx prisma generate --schema=packages/prisma/test/__fixture__/schema.{postgres,mysql}.prisma` before tests — two-file pattern (Prisma 5.22 rejected env-driven `provider` switching at parse time, so the adapter ships two schemas).

---

## §D. What Does NOT Change

Reassurance — these are stable across v1 → v2:

- **`@Crud()` decorator signature** — same options structure; `model`, `query`, `routes`, `params` all compatible
- **Generated endpoint paths + HTTP methods** — all 8 route handlers (`getManyBase`, `getOneBase`, `createOneBase`, `createManyBase`, `updateOneBase`, `replaceOneBase`, `deleteOneBase`, `recoverOneBase`) unchanged
- **`@Override()` decorator + `@ParsedRequest()` / `@ParsedBody()` param decorators** — stable
- **`@CrudAuth()` (`filter`, `persist`, `property`, `or`)** — stable
- **`RequestQueryBuilder` + `CondOperator` API** — stable (frontend query construction unchanged)
- **`CrudValidationGroups.CREATE` / `UPDATE`** — entity-as-DTO validation works identically
- **`CrudConfigService.load()`** — static global-defaults loader unchanged
- **Public `QueryTranslator<Q, W>` interface contract** — the 4 methods (`buildWhere`, `applyToQuery`, `count`, `findOneOrFail`) are stable across Phase 6.2's decomposition
- **`getMany` / `getOne` / `createOne` etc. return shapes** — unchanged (MikroORM's internal `em.findAndCount` → QB migration is invisible at the API boundary)
- **Piece interfaces (`WhereBuilder`, `QueryComposer`, `FetchHelper`)** — `@internal` in v2.0; advanced extension surface, NOT covered by semver-minor stability

If your code only uses the public surface (decorator, overrides with `@ParsedRequest`/`@ParsedBody`, query builder, validation groups), migration is mostly: audit column references in query params, then bump the version.

---

## Version & Branch Timeline

| Version | Branch | Status | Notes |
|---|---|---|---|
| `1.0.2` | `v1.0.2` | Shipped on npm 2026-04-21 | Current stable; continues to receive patches |
| `1.0.3+` | `v1.0.2` | As needed | Bugfixes only; no feature backports |
| `2.0.0` | `release/v2.0.0` (not yet cut) | In development on `dev` — Phases 3-9 landed, Phase 10-11 pending | Breaking; shipped as single coordinated release |
| `2.1+` | TBD | Planned | Carries items explicitly deferred from v2.0 (e.g., per-service `@Crud()` runtime config overrides, Drizzle SQLite real-DB tests) |

## Common Upgrade Errors & Fixes

| Error / symptom | Cause | Fix |
|---|---|---|
| `BadRequestException: Field "X" is not allowed` | Field not in `entityColumnsHash` | Add `@Column()` / register as entity column, or remove from query param |
| `BadRequestException: Relation "Y" is not allowed` | Dotted path with unknown relation | Add `?join=Y` to request AND register in `@Crud({ query: { join: { Y: {} } } })` |
| `TypeError: this.checkSqlInjection is not a function` | Subclass called deleted private | Call `this.sanitizer.assert(field)` instead |
| `TypeError: this.setSearchCondition is not a function` | Subclass called deleted protected | Override `TypeOrmQueryTranslator.buildWhere` in a custom translator |
| `TypeError: this.mapSort is not a function` / `this.getFieldWithAlias is not a function` / `this.getSort is not a function` | Subclass called Phase-5-deleted helper | Override `TypeOrmQueryComposer` sort logic via a custom translator (composer is `@internal` — deep-path import) |
| `TypeError: this.translator.count is not a function` | Custom `QueryTranslator<Q, W>` implementation missing Phase 6 method | Add `count(qb: Q): Promise<number>` — for TypeORM, `return qb.getCount()` |
| `TypeError: this.translator.findOneOrFail is not a function` | Custom translator missing Phase 5 method | Add `findOneOrFail(qb, opts)` — see `TypeOrmQueryTranslator` source for reference impl |
| `Cannot read properties of undefined (reading 'entityRelationsHash')` | Accessed field that moved to resolver | Hash is now per-`TypeOrmJoinResolver` instance; access via `this.joinResolver` |
| `Error: Cannot find module '@nestjs-crud/core/query/...'` | Tried to import `@internal` piece interfaces that aren't resolved by your tooling | The pieces are exported only via the `@nestjs-crud/core/query` subpath; ensure your bundler/resolver supports Node subpath resolution. These interfaces are `@internal` — pin exact versions if you depend on them |
| MikroORM: stale entity from previous request returned; `em.flush()` doesn't persist | Subclass cached `em` at ctor time; request-scope bypass | Replace captured `em` field with `this.getEm()` call inside every method that needs it |
| MikroORM Jest fails: `SyntaxError: Unexpected token 'export'` / `import.meta outside a module` | Running MikroORM specs without the ESM preset | Use `yarn test:mikro-orm` (has `NODE_OPTIONS=--experimental-vm-modules` inline) — NOT `npx jest` directly |
| TS: `Argument of type 'any' is not assignable to parameter of type 'X'` after bump | Phase 8 TYPES-02 MikroORM tightening | Add explicit type annotation (`FilterQuery<T>`, `RequiredEntityData<T>`, `EntityMetadata<T>`, `QueryOrderMap<T>`); most fixes one-line |
| TS: `Type 'any' is not assignable to type 'DrizzleClient'` on Drizzle subclass field | Phase 8 TYPES-01 — `protected db: any` → `DrizzleClient` | Remove the `protected db: any` re-declaration in your subclass; inherit the typed field from the base |
| TS: `Cannot find module '@nestjs/swagger/dist/types/swagger-enum.type'` | Phase 8 TYPES-05 — import removed | Stop importing from the internal path; inline the type locally as `string[] \| number[] \| (string \| number)[] \| Record<number, string>` |
| `RequestQueryException: Invalid persist key 'X'` (maps to 400 Bad Request) | Phase 8 SEC-02 — `@CrudAuth({ persist: { ... } })` has a typo that doesn't match any entity column | Fix the key name to match the entity column exactly. v1 silently ignored this, leaving auth-filter bypass; v2 fails fast |
| Unexpected SERIALIZABLE isolation inside your outer tx, or rollback cascading unexpectedly | Phase 8 SEC-03 — consumer `@Override()` wraps updateOne/replaceOne/deleteOne in an outer transaction; adapter now adds an inner savepoint at READ COMMITTED | Decide intent: either remove the outer wrap, or accept savepoint nesting semantics (per-ORM: all three use savepoints) |
| `Class 'X' incorrectly implements interface 'QueryTranslator<Q, W>'. Missing: count, findOneOrFail` | Custom translator from pre-v2 code | Add the two methods to your implementation |
| `console.warn: [nestjs-crud] strictSanitization: false` | Running v2.0-preview from `dev` BEFORE commit `7cb3534` | Pull latest `dev`; opt-out was removed. Final v2.0 has no such flag |
| npm install warnings about missing peer: `typeorm`, `@nestjs/typeorm`, `@nestjs/common` | Phase 8 BUILD-01 peerDeps audit landed | Install the peers explicitly: `yarn add typeorm @nestjs/typeorm @nestjs/common` (or the relevant adapter's peers) |
| npm install warning: `@nestjs/common@^10.0.0 but found ^11.x` on a NestJS 11 project | Known backlog bug 999.4 — Phase 8 peers understate the supported `@nestjs/common` range | Non-blocking; runtime works. Fix scheduled before v2.0.0 GA; adapter declarations will be corrected to `@nestjs/common: ^11.0.0` |
| `EBADENGINE: Unsupported engine` (Node <22) on `npm install` | Phase 8 BUILD-01 — `engines.node: ">=22.0.0"` on all 6 packages | Upgrade Node to 22.x, or stay on v1.0.x |
| Prisma: `Unknown argument 'where'` on `include: { company: { where: {...} } }` | Phase 9 spike finding L2 — Prisma rejects `where` inside `include` for to-one relations | Filter at parent `where`: `{ where: { company: { ... } } }`. Use filtered `include` only for to-many. Adapter does this automatically for SCondition dotted paths on to-one |
| Prisma: deep `include` query is slower than expected / emits multiple SELECTs | Phase 9 spike finding L1 — Prisma default is query decomposition, not SQL JOIN (1 + N_depth queries) | Opt into Prisma's `relationJoins` preview feature on your own `PrismaClient` (adapter inherits transparently). Not forced by library |
| Prisma: `createMany` returns fewer fields than TypeORM equivalent / missing DB-assigned ids | Phase 9 spike finding — Prisma native `createMany` returns `{ count }` only; adapter uses `$transaction([create, ...])` array form for parity | No action — this is already the library's default. If you see the v1 behavior, verify you're on v2 |

## Not Sure If Affected?

Run the Pre-Upgrade Audit greps at the top of this skill.

- Zero hits on (2)/(3)/(4)/(5)/(6)/(8)/(9)/(10)/(11) = you're only in §A territory (allowlist audit)
- Non-zero on (2) = standard subclass method migration (§B deleted methods)
- Non-zero on (3) = custom `QueryTranslator` — must implement Phase 5/6 interface additions
- Non-zero on (4) = MikroORM consumer, audit for T-06-02 stale-em risk
- Non-zero on (5) = runtime mutation of deleted fields — re-implement via the new interfaces
- Non-zero on (6) = subclass override on a method whose shape changed in Phase 5/6 — audit against the v2 source
- Non-zero on (8) = Drizzle subclass typing `protected db: any` — TYPES-01 break (§E)
- Non-zero on (9) = MikroORM subclass override on public method — audit returns for TYPES-02 generics (§E)
- Non-zero on (10) = one-line Swagger internal import swap (§E.TYPES-05)
- Non-zero on (11) = consumer `@Override()` on updateOne/replaceOne/deleteOne — audit transaction nesting (§E.SEC-03)
- Non-zero on (12) with typos in persist keys = expect `RequestQueryException` at runtime (§E.SEC-02)
- (13) failing = upgrade Node to 22.x or stay on v1.0.x (§E.BUILD-01)
