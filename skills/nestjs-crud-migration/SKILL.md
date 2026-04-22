---
name: nestjs-crud-migration
description: Use when migrating a NestJS project from @nestjs-crud/* v1.0.x to v2.0, diagnosing v2 upgrade errors (`Field "X" is not allowed`, `setSearchCondition is not a function`, `checkSqlInjection is not a function`, `entityRelationsHash` undefined, `translator.count is not a function`, `findOneOrFail is not a function`, MikroORM stale-em identity-map issues), or planning a v2 upgrade before npm publish ships.
---

# @nestjs-crud v1 → v2 Migration

## Status

**v2.0.0 is a coordinated breaking release** currently being built on the `dev` branch. Not yet published to npm. This skill covers:

- **LANDED:** breaking changes already committed on `dev` (Phases 3–6.2)
- **PLANNED:** breaking changes coming in Phases 7–11 before v2 ships (flagged explicitly)

**If you can't migrate yet:** pin to `^1.0.2`. The v1.0.x line continues to receive bugfix patches on the `v1.0.2` branch.

**Progress (as of 2026-04-22):** Phases 3 (ARCH-01), 4 (ARCH-02/03), 5 (ARCH-04 slim), 6.1 (MikroORM ESM export fix), 6.1.1 (MikroORM import.meta ESM), 6 (ARCH-05 alignment + REFACTOR-01 integration decouple), and 6.2 (translator decomposition) all landed on `dev`. Phase 7 (PARITY + CI matrix) next.

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
```

Non-zero results from (1) = allowlist audit (§A). Non-zero from (2)/(3)/(4)/(5)/(6) = subclass migration work (§B).

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
| **Breaking type signature tightening** (`any` removal) | TYPES-01..05 | PLANNED (Phase 8) | Medium — fewer `any`s in public API; strict TS projects may see new compile errors |
| **Optional logger injection** | OBS-01 | PLANNED (Phase 8) | None — additive, opt-in |
| **Transaction wrapping on `updateOne`/`replaceOne`/`deleteOne`** (SEC-03) | SEC-03 | PLANNED (Phase 8) | Low — consumer-facing semantics unchanged; internal race-window closed |
| **peerDependencies audit** (typeorm pkg missing entire peerDeps block; drizzle missing `@nestjs-crud/core`; mikro-orm core pin bump) | BUILD-01 | PLANNED (Phase 8) | Low — `npm install` warnings surface; no runtime break |
| **Prisma adapter** (new package) | ADAPTER-01 | PLANNED (Phase 9) | None — additive |

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

## §C. Planned Phase 7–11 Changes (Pre-Release Forecast)

These will land before v2.0.0 ships. Skill will be updated with exact details as each phase completes.

- **Phase 7 (PARITY-01..03 + CI-02):** Real-DB integration tests for Drizzle + MikroORM (Postgres + MySQL). Cross-adapter piece-level parity assertions. Per-adapter service-level smoke specs (~10 scenarios each). GitHub Actions matrix (3 adapters × 2 DBs = 6 parallel jobs). **No consumer-visible changes.**
- **Phase 8 (breaking types + logger + security + build):**
  - `TYPES-01..05`: `any` eliminated from public API signatures. Strict TS projects may see new compile errors — add type annotations where `any` was implicit.
  - `OBS-01`: optional `logger?: LoggerService` constructor argument. Additive — no breaking change.
  - `SEC-03`: `updateOne` / `replaceOne` / `deleteOne` wrapped in scoped transactions. Consumer-visible behavior unchanged; internal race-window closed. Custom `@Override()` extensions to these verbs should be audited for transaction nesting. Note: MikroORM will use `em.transactional()`; TypeORM will use QueryRunner; Drizzle will use `db.transaction()`. `// TODO(SEC-03)` anchors already planted in each adapter's service at the three write-method sites.
  - `BUILD-01`: peerDependencies audit — `@nestjs-crud/typeorm` will gain `typeorm`, `@nestjs/typeorm`, `@nestjs-crud/core`, `@nestjs/common`; `@nestjs-crud/drizzle` will gain `@nestjs-crud/core`, `@nestjs/common`; `@nestjs-crud/mikro-orm` core pin bumps to `^2.0.0`; `@nestjs-crud/core` will gain `@nestjs/common`. Consumer impact: `npm install` will now warn if peers are missing (previously silent for typeorm).
- **Phase 9 (ADAPTER-01):** `@nestjs-crud/prisma` publishes at parity with TypeORM. Net-new package — no migration impact.
- **Phase 11 (DOCS-04):** final Wiki migration guide supersedes this skill.

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
| `2.0.0` | `release/v2.0.0` (not yet cut) | In development on `dev` — Phases 3-6.2 landed, Phase 7+ pending | Breaking; shipped as single coordinated release |
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
| TS: `Argument of type 'any' is not assignable to parameter of type 'X'` after bump | Phase 8 type tightening (pending) | Add explicit type annotation; most fixes are one-line |
| `Class 'X' incorrectly implements interface 'QueryTranslator<Q, W>'. Missing: count, findOneOrFail` | Custom translator from pre-v2 code | Add the two methods to your implementation |
| `console.warn: [nestjs-crud] strictSanitization: false` | Running v2.0-preview from `dev` BEFORE commit `7cb3534` | Pull latest `dev`; opt-out was removed. Final v2.0 has no such flag |
| npm install warnings about missing peer: `typeorm`, `@nestjs/typeorm`, `@nestjs/common` | Phase 8 BUILD-01 peerDeps audit landed | Install the peers explicitly: `yarn add typeorm @nestjs/typeorm @nestjs/common` (or the relevant adapter's peers) |

## Not Sure If Affected?

Run the Pre-Upgrade Audit greps at the top of this skill.

- Zero hits on (2)/(3)/(4)/(5)/(6) = you're only in §A territory (allowlist audit)
- Non-zero on (2) = standard subclass method migration (§B deleted methods)
- Non-zero on (3) = custom `QueryTranslator` — must implement Phase 5/6 interface additions
- Non-zero on (4) = MikroORM consumer, audit for T-06-02 stale-em risk
- Non-zero on (5) = runtime mutation of deleted fields — re-implement via the new interfaces
- Non-zero on (6) = subclass override on a method whose shape changed in Phase 5/6 — audit against the v2 source
