---
name: nestjs-crud-migration
description: Use when migrating a NestJS project from @nestjs-crud/* v1.0.x to v2.0, diagnosing v2 upgrade errors (`Field "X" is not allowed`, `setSearchCondition is not a function`, `checkSqlInjection is not a function`, `entityRelationsHash` undefined), or planning a v2 upgrade before npm publish ships.
---

# @nestjs-crud v1 → v2 Migration

## Status

**v2.0.0 is a coordinated breaking release** currently being built on the `dev` branch. Not yet published to npm. This skill covers:

- **LANDED:** breaking changes already committed on `dev` (Phases 3–4 + cleanup)
- **PLANNED:** breaking changes coming in Phases 5–11 before v2 ships (flagged explicitly below)

**If you can't migrate yet:** pin to `^1.0.2`. The v1.0.x line continues to receive bugfix patches on the `v1.0.2` branch.

## Pre-Upgrade Audit — Run These Greps First

Before bumping to v2, search your codebase for anything that will break:

```bash
# 1. Query params with fields that may not be in entityColumnsHash
#    (sort=, filter=, search=, fields=, join=) — LANDED breakage
grep -rE "sort=|filter=|search=|fields=" src/ test/

# 2. Services subclassing @nestjs-crud adapters and overriding internals
#    Any of these method overrides break — see "Deleted Service Methods" below
grep -rE "(setSearchCondition|setAndWhere|setOrWhere|setJoin|getRelationMetadata|checkSqlInjection|mapSort|getFieldWithAlias)\s*\(" src/

# 3. Runtime mutation of deleted fields
grep -rE "\.(sqlInjectionRegEx|entityRelationsHash)\s*=" src/

# 4. Usage of pre-v2 deprecated surfaces (already @deprecated in v1.0.2)
grep -rE "ParamOption\.enum|DrizzleCrudService.*\.db" src/
```

Non-zero results from (1) = schedule an allowlist audit (see §A). Non-zero from (2) or (3) = subclass migration work (see §B).

## Quick Reference — What Breaks

| Area | Status | Impact |
|------|--------|--------|
| **Strict column-name allowlist** (ARCH-03) | LANDED | High — hits any consumer with typos, virtual columns, or dotted paths |
| **Deleted internal service methods** (ARCH-01/02) | LANDED | Medium — only hits consumers subclassing `*CrudService` to override internals |
| **InputSanitizer replaces `checkSqlInjection`** (ARCH-03) | LANDED | Medium — same audience as above |
| **`mapSort` / `getFieldWithAlias` move from service to translator** (ARCH-04) | PLANNED (Phase 5) | Medium — subclass overrides break |
| **`TypeOrmQueryTranslator` ctor signature change** (ARCH-04) | PLANNED (Phase 5) | Low — Phase 3's ctor was never stable API |
| **Breaking type signature tightening** (TYPES-01..05) | PLANNED (Phase 8) | Medium — fewer `any`s in public API; some code may fail strict compile |
| **Optional logger injection** (OBS-01) | PLANNED (Phase 8) | None — additive, opt-in |
| **Transaction wrapping on `updateOne`/`replaceOne`/`deleteOne`** (SEC-03) | PLANNED (Phase 8) | Low — consumer-facing semantics unchanged, internal race-window closed |
| **Prisma adapter** (ADAPTER-01) | PLANNED (Phase 9) | None — new package, additive |

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
- **Relation-qualified dotted paths** (`?sort=author.name`) — require the relation to be explicitly joined via `?join=author` so the first segment is in the allowlist

### Migration

1. **Audit every route's** `sort=` / `search=` / `filter=` / `fields=` usage against entity `@Column` definitions.
2. **Virtual / formula / computed fields** — register them in `entityColumnsHash` (consult your ORM docs; TypeORM exposes them automatically when metadata is complete) or stop referencing them in query params.
3. **Dotted paths** — add `?join=relation` to the request. Also register the relation in the `@Crud({ query: { join: {...} } })` options so server-side joins are allowed.
4. **No silent typo tolerance** — fix column names in client-side `RequestQueryBuilder` calls.

### Before / after

```ts
// v1.x
GET /users?fields=neame                  // 200 OK, empty result (silent typo)
GET /users?sort=author.name              // 200 OK (no join required)

// v2.0
GET /users?fields=neame                  // 400 — 'Field "neame" is not allowed'
GET /users?sort=author.name              // 400 (unless ?join=author is also present)
GET /users?sort=author.name&join=author  // 200 OK
```

### No opt-out — why not?

A runtime opt-out was considered and explicitly rejected: it would have been a security kill-switch that consumers would leave enabled indefinitely. v2 is a breaking release and the allowlist audit is part of the upgrade cost. If you need to ship without the audit, stay on v1.0.x.

---

## §B. Deleted Service Internals — LANDED

Affects **consumers who subclass `TypeOrmCrudService` / `DrizzleCrudService` / `MikroOrmCrudService` and override protected / private internals.** Standard usage (just extending the class and wiring it to NestJS DI) is unaffected.

### Deleted protected/private methods (with commit references)

| Surface | v1 location | v2 status | Replacement |
|---|---|---|---|
| `setSearchCondition(builder, search)` | `TypeOrmCrudService` protected | Deleted (`44d403c`) | Logic lives in `TypeOrmQueryTranslator.buildWhere` |
| `setAndWhere(cond, i, builder)` | `TypeOrmCrudService` protected | Deleted (`44d403c`) | Absorbed into translator |
| `setOrWhere(cond, i, builder)` | `TypeOrmCrudService` protected | Deleted (`44d403c`) | Absorbed into translator |
| `setJoin(cond, joinOptions, builder)` | `TypeOrmCrudService` protected | Deleted (`7cc5c4c`) | `TypeOrmJoinResolver.applyJoins` |
| `getRelationMetadata(field, options)` | `TypeOrmCrudService` protected | Deleted (`7cc5c4c`) | `TypeOrmJoinResolver` internal |
| `checkSqlInjection(field)` | all 3 adapters, private | Deleted (`31d2edf`, `6762ce9`) | `InputSanitizer.assert(field)` |

### Deleted fields

| Field | v1 location | v2 status |
|---|---|---|
| `sqlInjectionRegEx` | all 3 adapters | Deleted — no equivalent (denylist fallback removed entirely) |
| `entityRelationsHash` | `TypeOrmCrudService` protected | Moved onto `TypeOrmJoinResolver` instance |

### Planned (Phase 5) — additional removals

| Surface | Planned status | Replacement |
|---|---|---|
| `mapSort(sort)` | Will move from `TypeOrmCrudService` to translator | Override `TypeOrmQueryTranslator` sort logic instead |
| `getFieldWithAlias(field, sort)` | Will move from service to translator | Same — override in translator subclass |

### Migration for subclassers

If your service subclass overrode any of the above:

1. **Subclass the translator / resolver instead.** Both are exported:
   ```ts
   // Before — v1
   class MyService extends TypeOrmCrudService<User> {
     protected setSearchCondition(qb, search) { /* custom logic */ }
   }

   // After — v2
   import { TypeOrmQueryTranslator } from '@nestjs-crud/typeorm';

   class MyTranslator<T extends ObjectLiteral> extends TypeOrmQueryTranslator<T> {
     public buildWhere(search: SCondition): Brackets | undefined {
       // custom logic, returns Brackets (or calls super)
       return super.buildWhere(search);
     }
   }

   class MyService extends TypeOrmCrudService<User> {
     constructor(@InjectRepository(User) repo: Repository<User>) {
       super(repo);
       // Phase 5 will finalize the ctor injection hook;
       // until then, override `createBuilder` to plug in MyTranslator
     }
   }
   ```
2. **For `checkSqlInjection` overrides:** implement the `InputSanitizer` interface (`check(field): boolean` + `assert(field): void`) and the service's `protected readonly sanitizer` field will be your replacement hook.
3. **For `sqlInjectionRegEx` runtime mutation:** no replacement exists. Denylist fallback was removed entirely. If you needed custom injection rules, encode them in an allowlist transform via a custom `InputSanitizer` implementation.

---

## §C. Planned Phase 5–11 Changes (Pre-Release Forecast)

These will land before v2.0.0 ships. Skill will be updated with exact details as each phase completes.

- **Phase 5 (ARCH-04):** `TypeOrmCrudService` slimmed to ~200-line orchestrator. `mapSort` / `getFieldWithAlias` move to translator. `TypeOrmQueryTranslator` ctor becomes `(repo, { entityColumnsHash, onBadRequest, joinResolver })`. `applyToQuery` expands to apply sort + pagination + field selection + soft-delete + eager joins — consumers who built custom translators need to handle these concerns.
- **Phase 6 (ARCH-05 + REFACTOR-01):** Drizzle + MikroORM adapters aligned to the TypeORM orchestration pattern. Adapter overrides that depended on divergent shapes may need to be rewritten against the shared interface.
- **Phase 7 (PARITY):** Real-DB integration tests for Drizzle + MikroORM. No consumer-visible changes.
- **Phase 8 (breaking types + logger + security):**
  - `TYPES-01..05`: `any` eliminated from public API signatures. Strict TS projects may see new compile errors — add type annotations where `any` was implicit.
  - `OBS-01`: optional `logger?: LoggerService` constructor argument. Additive — no breaking change.
  - `SEC-03`: `updateOne` / `replaceOne` / `deleteOne` wrapped in scoped transactions. Consumer-visible behavior unchanged; internal race-window closed. Custom `@Override()` extensions to these verbs should be audited for transaction nesting.
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

If your code only uses the public surface (decorator, overrides with `@ParsedRequest`/`@ParsedBody`, query builder, validation groups), migration is mostly: audit column references in query params, then bump the version.

---

## Version & Branch Timeline

| Version | Branch | Status | Notes |
|---|---|---|---|
| `1.0.2` | `v1.0.2` | Shipped on npm 2026-04-21 | Current stable; continues to receive patches |
| `1.0.3+` | `v1.0.2` | As needed | Bugfixes only; no feature backports |
| `2.0.0` | `release/v2.0.0` (not yet cut) | In development on `dev` | Breaking; shipped as single coordinated release |
| `2.1+` | TBD | Planned | Carries items explicitly deferred from v2.0 (e.g., per-service `@Crud()` runtime config overrides where metadata access proved non-trivial) |

## Common Upgrade Errors & Fixes

| Error / symptom | Cause | Fix |
|---|---|---|
| `BadRequestException: Field "X" is not allowed` | Field not in `entityColumnsHash` | Add `@Column()` / register as entity column, or remove from query param |
| `TypeError: this.checkSqlInjection is not a function` | Subclass called deleted private | Call `this.sanitizer.assert(field)` instead |
| `TypeError: this.setSearchCondition is not a function` | Subclass called deleted protected | Override `TypeOrmQueryTranslator.buildWhere` via a custom translator class |
| `Cannot read properties of undefined (reading 'entityRelationsHash')` | Accessed field that moved to resolver | Hash is now per-`TypeOrmJoinResolver` instance; access via `this.joinResolver` (Phase 4+ name) |
| TS: `Argument of type 'any' is not assignable to parameter of type 'X'` after bump | Phase 8 type tightening | Add explicit type annotation; most fixes are one-line |
| `console.warn: [nestjs-crud] strictSanitization: false` | Running v2.0-preview from `dev` BEFORE commit `7cb3534` | Pull latest `dev`; opt-out was removed. Final v2.0 has no such flag |

## Not Sure If Affected?

Run the Pre-Upgrade Audit greps at the top of this skill. Zero hits on lines (2) + (3) + (4) = you're only in §A territory (allowlist audit). Non-zero = consult §B for subclass migration paths.
