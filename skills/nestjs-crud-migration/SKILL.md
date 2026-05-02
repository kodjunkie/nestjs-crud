---
name: nestjs-crud-migration
description: >-
  Use when migrating `@nestjs-crud/*` v1.0.x → v2.x — the v2.0 strict allowlist break, deleted subclass internals, type tightening, write-path transactions, the v2.1 Prisma 7 driver-adapter switch (`schema.prisma` `datasource.url` removal, `prisma.config.ts` forwarding, dropped `--skip-generate` flag, `adapter-pg` `search_path` landmine, `adapter-mariadb` session-state landmine), the v2.1.1 swagger v3-gate cleanup, or the v2.2.0 caching API. Use when diagnosing v2 upgrade errors like `RequestQueryException`, `CrudCacheNotConfiguredError`, `setSearchCondition is not a function`, `count is not a function`, MikroORM stale-em, or Prisma `Unknown argument 'where'` inside include.
---

# @nestjs-crud Migration

Consumer playbook for v1 → v2 and within-v2 upgrades. Stay on v1.0.x: pin `^1.0.2` (see Stay-On Pin §). v2.0 = single coordinated breaking release; v2.1 narrows Prisma peer to v7; v2.1.1 = security/dead-code patch; v2.2.0 = unified caching API (additive).

## Pre-Upgrade Audit (greps to run first)

```bash
# 1. Query params with fields that may not be in entityColumnsHash (strict allowlist throws)
grep -rE "sort=|filter=|search=|fields=" src/ test/

# 2. Subclass overrides of deleted internals (§B)
grep -rE "(setSearchCondition|setAndWhere|setOrWhere|setJoin|getRelationMetadata|checkSqlInjection|mapSort|getFieldWithAlias|getSort)\s*\(" src/

# 3. Custom translators — must implement count() + findOneOrFail()
grep -rE "implements QueryTranslator<|extends TypeOrmQueryTranslator" src/

# 4. MikroORM subclasses caching `em` (stale identity-map risk)
grep -rE "this\.em\s*=|private\s+(readonly)?\s*em:\s*EntityManager" src/

# 5. Drizzle subclasses typing `protected db: any`
grep -rE "protected\s+db\s*:\s*any|extends\s+DrizzleCrudService" src/

# 6. Internal swagger imports (SwaggerEnumType inlined in v2; getSwaggerVersion/swaggerPkgJson removed in v2.1.1)
grep -rE "from\s+['\"]@nestjs/swagger/dist/types/swagger-enum\.type['\"]|getSwaggerVersion|swaggerPkgJson" src/

# 7. Consumer @Override on updateOne/replaceOne/deleteOne (transaction-nesting audit)
grep -rE "@Override\(\)\s*(async\s+)?(updateOne|replaceOne|deleteOne)" src/

# 8. @CrudAuth persist key usage (runtime validation throws on typos)
grep -rE "@CrudAuth|CrudAuth\s*\(\s*\{" src/

# 9. @Crud cache option (without DataSource cache or CacheStrategy → fail-fast)
grep -rE "cache:\s*[0-9]+|cache:\s*true" src/

# 10. Node version
node --version  # must be >=22; install refuses otherwise
```

| Hit | Action |
|-----|--------|
| #1 | Audit allowlist (§A) |
| #2-#5 | Subclass migration (§B-§C) |
| #6 | Drop deleted import (§C) |
| #7 | Audit transaction nesting (§D) |
| #8 | Audit `persist` keys against entity columns |
| #9 | Wire CacheStrategy (§v2.2.0) or remove `cache` option |
| #10 fail | Upgrade Node 22+ or stay on v1.0.x |

## Quick Reference — What Breaks

| Area | Impact | Section |
|------|--------|---------|
| **Strict allowlist** — unknown sort/filter/search/fields → 400 | High (every consumer) | §A |
| **Deleted subclass internals** (`setSearchCondition`, `checkSqlInjection`, etc) | Medium (subclass-override consumers) | §B |
| **`QueryTranslator<Q,W>`** must implement `count` + `findOneOrFail` | Medium (custom translator consumers) | §B |
| **MikroORM `getEm` thunk contract** — never cache `em` | Medium (MikroORM subclass consumers) | §B |
| **Drizzle `protected db: DrizzleClient`** (was `any`) | Medium (subclass-override) | §C |
| **MikroORM signatures typed** (15 `any` sites → typed generics) | Medium (subclass-override) | §C |
| **`@CrudAuth` persist runtime-validated** — typos throw | Medium (auth-filter bypass closed) | §D |
| **Write-path transactions** at READ COMMITTED on update/replace/deleteOne | Low normal; medium with consumer outer-tx | §D |
| **TypeORM `relationLoadStrategy: 'query'` opt-in** | Additive; footgun re `JoinOption.allow` | §D |
| **Cache fail-fast** — `@Crud cache` without backend → throws | Medium (was silent in v1) | §D |
| **Swagger default text rewrite** + `Swagger.operationsMap` shape change | Snapshot-test consumers only | §D |
| **`engines.node: ">=22"`** | Install refuses on Node <22 | §E |
| **`@nestjs-crud/prisma`** (additive new package) | Zero impact unless adopting | §F |

## §A. Strict Column-Name Allowlist

**Most consumers feel v2 here first.** Field names in `sort=` / `filter=` / `search=` / `fields=` / `join=` MUST be in the entity's `entityColumnsHash` OR a relation registered in `@Crud({ query: { join: {...} } })`. Otherwise 400 `Field "X" is not allowed`.

| | v1.x | v2.0 |
|---|------|------|
| Validation | Denylist regex | **Allowlist** from `entityColumnsHash` |
| Unknown field | Silent 200 OK (typo → empty result) | **400** |
| Backing regex | `sqlInjectionRegEx` (per-adapter) | Deleted entirely; `InputSanitizer` is sole path |
| Opt-out | — | **None** |

**Common breakages:** column typos; `@VirtualColumn` / `@Formula` fields not in metadata; dotted paths (`?sort=author.name`) without explicit `?join=author` AND `@Crud({ query: { join: { author: {} } } })` registration.

**Migration:** audit every `sort=` / `search=` / `filter=` / `fields=` against entity `@Column` definitions; register virtual fields explicitly; add joins for dotted paths.

## §B. Deleted Service Internals

Affects subclass consumers only. Standard usage (extending the class for DI wiring) is unaffected.

**Deleted protected/private methods (replacements):**

| v1 surface | v2 replacement |
|------------|----------------|
| `setSearchCondition` / `setAndWhere` / `setOrWhere` | `TypeOrmQueryTranslator.buildWhere` |
| `setJoin` / `getRelationMetadata` | `TypeOrmJoinResolver.applyJoins` |
| `checkSqlInjection` | `InputSanitizer.assert(field)` |
| `mapSort` / `getFieldWithAlias` / `getSort` | `TypeOrmQueryComposer` (deep-path `@internal`) |
| `prepareEntityBeforeSave` / `getSelect` / `findOneOrFail` | Retained as 1-line delegators to pure utils |

**Deleted fields:** `sqlInjectionRegEx` (no replacement); `entityRelationsHash` (moved onto `TypeOrmJoinResolver`).

**Custom `QueryTranslator<Q, W>` implementations** must add 2 methods:
- `count(qb: Q): Promise<number>` — `qb.getCount()` for TypeORM
- `findOneOrFail(qb: Q, opts): Promise<T>` — see `TypeOrmQueryTranslator` source for reference impl

Common error: `TypeError: this.translator.count is not a function`.

**MikroORM `getEm: () => EntityManager` thunk contract.** `MikroOrmFetchHelper` resolves `em` fresh per call. Subclasses MUST call `this.getEm()` inside every method; **never cache `em` as a field** — re-introduces cross-request identity-map bug. See `nestjs-crud` SKILL §Common Issues for the exact pattern.

**Internal piece interfaces** (`WhereBuilder<Q,W>` / `QueryComposer<Q>` / `FetchHelper<Q>`) live in `@nestjs-crud/core/query` subpath, marked `@internal`. Public `QueryTranslator<Q,W>` contract unchanged — pieces are advanced extension surface NOT covered by semver-minor stability.

## §C. Type Tightening

**Drizzle:** `protected db: DrizzleClient` (was `any`). Subclasses re-declaring `protected db: any` conflict with the base. Fix: delete the re-declaration, inherit from base.

**MikroORM:** 15 `any` sites on public method signatures → typed generics (`FilterQuery<T>`, `RequiredEntityData<T>`, `EntityMetadata<T>`, `QueryOrderMap<T>`). Subclass callsites passing untyped values need explicit annotations.

**Core:** `SwaggerEnumType` inlined — no more `@nestjs/swagger/dist/types/swagger-enum.type` import. Replace with inline type: `string[] | number[] | (string | number)[] | Record<number, string>`.

**v2.1.1 cleanup:** `getSwaggerVersion` and `swaggerPkgJson` removed from `@nestjs-crud/core` exports (internal v3-gate helpers). Delete imports if you had them; no replacement (`safeRequire` inside library handles missing swagger).

## §D. Behavior Changes

### Optional logger

All 4 adapters default to `new Logger(<ServiceName>)` when omitted. TypeORM/Drizzle/MikroORM accept `logger?: LoggerService` as last positional constructor arg. **Prisma differs:** logger lives inside `serviceConfig` as `{ error, warn?, debug? }`. Default when omitted: constructor auto-instantiates `new Logger(PrismaCrudService.name)` (parity with other 3 in v2.0). If you relied on v1 silent-no-op, pass explicit no-op logger via `serviceConfig.logger`.

**Logger emission (all adapters):** `debug` for query traces; `warn` for SQLi rejections + tx rollbacks; `error` for uncaught DB errors. **NEVER interpolate `err.message`** — DB drivers leak SQL parameter values; emit `err.name` + `err.stack` as second arg.

### `@CrudAuth` persist runtime validation

v1 silently ignored typos in `@CrudAuth({ persist: { ... } })` — auth-filter bypass on writes. v2 validates each persist key against `entityColumnsHash`; throws `RequestQueryException: Invalid persist key 'X'` (mapped to 400). Audit every `persist` block against entity column names.

### Write-path transactions

`updateOne` / `replaceOne` / `deleteOne` wrap read-modify-write at **READ COMMITTED** on all 4 adapters — closes lost-update race. Scope: these 3 ops only. `recoverOne` excluded (no read-modify-write race).

| Adapter | Primitive |
|---------|-----------|
| TypeORM | `QueryRunner` + `startTransaction('READ COMMITTED')` |
| Drizzle | `db.transaction(..., { isolationLevel: 'read committed' })` + `translator.cloneFor(tx)` |
| MikroORM | `em.transactional(... + RequestContext.create(...), { isolationLevel: READ_COMMITTED })` |
| Prisma | `$transaction(..., { isolationLevel: 'ReadCommitted' })` |

**Transaction nesting** (consumer `@Override()` opens outer tx around adapter's inner): on all 4 adapters the inner becomes a **savepoint** inside yours. Inner READ COMMITTED is best-effort — outer SERIALIZABLE / REPEATABLE READ NOT downgraded. Rollbacks cascade up. Decide intent: remove outer wrap, or accept savepoint semantics.

### TypeORM split-query relation loading (additive)

`@Crud({ query: { relationLoadStrategy: 'query' } })` opts into separate query per relation via `setFindOptions`. Default `'join'` (today's behavior). ⚠ **Footgun:** under `'query'`, `JoinOption.allow` does NOT constrain relation columns (TypeORM's `setFindOptions` doesn't expose alias-level select control). Don't opt in if you use `allow` to hide sensitive columns. Other adapters use split queries natively — opt-in is a no-op.

### Cache fail-fast

`@Crud({ query: { cache } })` without a CacheStrategy (and TypeORM without `DataSource.cache`) throws `CrudCacheNotConfiguredError` (plain `Error` from `@nestjs-crud/core`) at the first cached read. Fix: wire a strategy (§v2.2.0), configure `DataSource cache` (TypeORM), or remove `cache` from `@Crud()`.

### Swagger default text rewrite

v2 rewrites all 8 generated routes' summaries + descriptions (imperative, outcome-focused). Runtime-additive. **Snapshot-test consumers will drift** — re-record OR pin v1 wording via `@Crud({ swagger: { operations: { getManyBase: { summary: 'Retrieve multiple Users' } } } })`. Internal `Swagger.operationsMap` shape changed `string` → `{ summary, description }` tuples (rare deep-path callers must destructure).

## §E. Packaging

- All 7 packages declare `"engines": { "node": ">=22.0.0" }`. `npm install` refuses on Node <22.
- `peerDependencies` declared on every adapter package. Install warns if peers missing.
- `@nestjs/common` peer range: `^10.0.0 || ^11.0.0` — supports Nest 10 and 11.
- v2.1.1 added `@nestjs/swagger` as optional peerDependency on `@nestjs-crud/core` (`^10.0.0 || ^11.0.0` + `peerDependenciesMeta.optional: true`); consumers without swagger get no install warning.

## §F. `@nestjs-crud/prisma` (additive — net-new package)

Zero migration impact for existing consumers. Same 8 CrudService methods + SCondition operators + `WhereBuilder`/`QueryComposer`/`FetchHelper` shape (deep-path `@nestjs-crud/prisma/query`).

```bash
npm install @nestjs-crud/prisma @prisma/client
npm install -D prisma
# v2.1.0+: also need a driver adapter — see v2.0 → v2.1 below
```

Service constructor pattern: see `nestjs-crud` SKILL §Quickstart.

**Prisma-specific behaviors:**
- Default relation strategy is **query decomposition**, not SQL JOIN (1 + N_depth queries). Opt into `relationJoins` preview on your `PrismaClient` for native JOINs.
- `where` inside `include` rejected for to-one relations. Filter at parent `where`. Adapter handles SCondition dotted paths on to-one this way automatically.
- `createMany` uses `$transaction([create, ...])` for full-record return parity (slower, returns full records).

CI matrix: 4 adapters × 2 DBs = 8 cells + parity + no-swagger sentinel.

## §G. What Does NOT Change

- `@Crud()` decorator signature (options structure)
- 8 generated endpoint paths + HTTP methods
- `@Override()` + `@ParsedRequest()` + `@ParsedBody()`
- `@CrudAuth()` (filter / persist / property / or)
- `RequestQueryBuilder` + `CondOperator` enum API
- `CrudValidationGroups.CREATE` / `UPDATE`
- `CrudConfigService.load()`
- Public `QueryTranslator<Q,W>` interface
- `getMany` / `getOne` / `createOne` / etc. return shapes

If you only use the public surface (decorator, `@ParsedRequest`/`@ParsedBody` overrides, query builder, validation groups), migration is: audit column references in query params, then bump.

## Common Upgrade Errors & Fixes

| Error / symptom | Cause | Fix |
|-----------------|-------|-----|
| `BadRequestException: Field "X" is not allowed` | Field not in `entityColumnsHash` | Add `@Column()`, register virtual field, or remove from query param |
| `BadRequestException: Relation "Y" is not allowed` | Dotted path with unknown relation | Add `?join=Y` AND register in `@Crud({ query: { join: { Y: {} } } })` |
| `TypeError: this.checkSqlInjection is not a function` | Subclass called deleted private | `this.sanitizer.assert(field)` |
| `TypeError: this.setSearchCondition is not a function` | Subclass called deleted protected | Override `TypeOrmQueryTranslator.buildWhere` in custom translator |
| `TypeError: this.translator.count is not a function` | Custom translator missing `count()` | Add `count(qb): Promise<number>` — `return qb.getCount()` for TypeORM |
| `TypeError: this.translator.findOneOrFail is not a function` | Custom translator missing method | Add `findOneOrFail(qb, opts)` — see `TypeOrmQueryTranslator` source |
| `Cannot read properties of undefined (reading 'entityRelationsHash')` | Field moved | Now per-`TypeOrmJoinResolver` instance — access via `this.joinResolver` |
| MikroORM: stale entity / `em.flush()` doesn't persist | Subclass cached `em` at constructor | Replace captured field with `this.getEm()` calls inside methods |
| MikroORM Jest `SyntaxError: Unexpected token 'export'` / `import.meta` | Wrong test runner invocation | Use `yarn test:mikro-orm` (has `NODE_OPTIONS=--experimental-vm-modules` inline) |
| TS: `Type 'any' is not assignable to type 'DrizzleClient'` | Drizzle subclass field re-declaration | Remove `protected db: any`; inherit from base |
| TS: `Argument of type 'any' is not assignable to parameter of type 'X'` | MikroORM type tightening | Annotate with `FilterQuery<T>`/`RequiredEntityData<T>`/etc |
| `Module '"@nestjs-crud/core"' has no exported member 'getSwaggerVersion'` / `swaggerPkgJson` | Removed in v2.1.1 (internal v3-gate cleanup) | Delete the imports — no replacement |
| `RequestQueryException: Invalid persist key 'X'` → 400 | Typo in `@CrudAuth({ persist: {...} })` | Fix key to match entity column exactly |
| `CrudCacheNotConfiguredError` on first cached read | `@Crud cache` set but no strategy/backend | Wire `CacheStrategy` via `CrudConfigService.load`, configure TypeORM `DataSource.cache`, or remove `cache` from `@Crud()` |
| Relation columns under `'query'` strategy include columns NOT in `JoinOption.allow` | Documented divergence (`setFindOptions` doesn't expose alias-level select) | Stay on `'join'` for sensitive relations or audit explicitly |
| Prisma service emits logs when it didn't before | v2 unified default — `serviceConfig.logger` omitted = `new Logger(...)` instead of silent | Pass explicit no-op logger via `serviceConfig.logger` |
| `Property 'summary' does not exist on type 'string'` on `Swagger.operationsMap(...)` | Internal API shape changed | Destructure, or switch to stable `@Crud({ swagger: { operations: {...} } })` |
| Swagger snapshot tests fail | v2 rewrites default summaries + descriptions | Re-record OR pin v1 wording via `@Crud({ swagger: { operations: {...} } })` |
| Unexpected SERIALIZABLE inside outer tx, or rollback cascade | Consumer `@Override()` outer-tx + adapter's inner READ COMMITTED savepoint | Decide: remove outer wrap, or accept savepoint nesting |
| `Class 'X' incorrectly implements interface 'QueryTranslator<Q, W>'. Missing: count, findOneOrFail` | Pre-v2 custom translator | Add both methods |
| npm install peer warnings | peerDeps declared in v2 | Install peers explicitly |
| `EBADENGINE: Unsupported engine` | Node <22 | Upgrade Node 22+, or stay on v1.0.x |
| Prisma: `Unknown argument 'where'` on `include: { rel: { where: ... } }` for to-one | Prisma rejects `where` inside `include` for to-one | Filter at parent `where`. Adapter does this automatically for SCondition dotted paths |
| Prisma: deep `include` slow / N+1-looking logs | Prisma default = query decomposition | Opt into `relationJoins` preview on your `PrismaClient` |
| Prisma: `createMany` returns fewer fields | Adapter uses `$transaction([create, ...])` for parity | Verify v2 — if you see v1 behavior, bump |

## v2.0 → v2.1 (Prisma 7)

`@nestjs-crud/prisma@2.1.0` narrows `@prisma/client` peer to `^7.0.0`. Adapter runtime API unchanged — no code changes in subclasses. All migration is in schema files + CLI invocations + `PrismaClient` constructor. Other 6 packages republish at 2.1.0 with no behavior change.

**Canonical walkthrough:** [v2.1 Migration wiki](https://github.com/kodjunkie/nestjs-crud/wiki/v2.1-Migration). This section is triage summary.

**Pre-upgrade audit** (Prisma consumers only):

```bash
# 1. schema.prisma still carries url = env(...) — v7 rejects it
grep -rnE 'url\s*=\s*env\("DATABASE_URL"\)' . --include='*.prisma'

# 2. CI / scripts pass hard-removed --skip-generate flag
grep -rn "skip-generate" . --include='*.json' --include='*.yml' --include='Dockerfile*'

# 3. PrismaClient constructor relies on env-auto or datasourceUrl (all throw on v7)
grep -rnE "new PrismaClient\(\s*\)|datasourceUrl|datasources:\s*\{" src/

# 4. Postgres on non-public schema (adapter-pg landmine)
grep -rn '\?schema=' . --include='*.env*' --include='*.ts'

# 5. MySQL teardown relies on session-scoped SET (adapter-mariadb landmine)
grep -rnE "FOREIGN_KEY_CHECKS|SET SESSION|SET @" src/ test/
```

| Symptom | Cause | Fix |
|---------|-------|-----|
| `prisma generate`: `The property url on the datasource block is not allowed` | v5-shaped schema on v7 | Drop `url = env(...)` from every `datasource` block |
| `prisma db push`: `The datasource.url property is required in your Prisma config file` | Missing `prisma.config.ts` forwarding `DATABASE_URL` | Add `prisma.config.ts` forwarding env into `datasource.url` |
| `prisma db push`: `Unknown argument '--skip-generate'` | v7 hard-removed the flag | Drop the flag — `db push` auto-generates now |
| `new PrismaClient()` throws `datasourceUrl` mismatch | v7 rejects `datasourceUrl` against v7 schemas; no implicit env read | Wire driver adapter: `new PrismaClient({ adapter: new PrismaPg(...) })` for Postgres; `new PrismaMariaDb(url)` for MySQL |
| Postgres: tables in `public` despite `?schema=custom` | `@prisma/adapter-pg` does NOT run `SET search_path` on connect (undocumented) | Pass libpq `options=-c search_path=<schema>` in pg `PoolConfig` AND `schema` as 2nd `PrismaPg` arg |
| MySQL: `SET FOREIGN_KEY_CHECKS=0; TRUNCATE` fails | `@prisma/adapter-mariadb` dispatches each call on fresh pool checkout — session SETs don't persist (undocumented) | Use dependency-ordered `DELETE FROM` + `ALTER TABLE ... AUTO_INCREMENT = 1` for teardown; replay `SET SESSION` via mariadb pool's `initSql` |

## v2.1.0 → v2.1.1

Security + dead-code patch. Near-zero consumer impact for standard usage.

- 22 dev-tree GHSAs closed via root `resolutions` (your transitive exposure depends on YOUR install graph, not ours).
- `@nestjs/swagger` declared as optional `peerDependency` on `@nestjs-crud/core` (`peerDependenciesMeta.optional: true`).
- `getSwaggerVersion` and `swaggerPkgJson` removed (internal v3-gate helpers — delete imports if you had them; no replacement, `safeRequire` inside library handles graceful no-swagger).
- Dropped `swagger.ApiProperty || swagger.ApiModelProperty` fallback (`ApiModelProperty` deprecated in v4 / 2018; v2.x peer floor is `^10` so unreachable).

## v2.1.1 → v2.2.0 — Caching

**Caching is opt-in and backward-compatible.** Existing `@Crud({ query: { cache } })` consumers see no behavior change unless they wire a `CacheStrategy`. **No migration steps required.**

What's new (additive):
- `CacheStrategy` interface in `@nestjs-crud/core/cache` honored by all 4 adapters (was TypeORM-only pre-2.2.0).
- Strategies (`TypeOrm | MikroOrm | Drizzle | PrismaRedis | PrismaAccelerate`) accept `redis` (node-redis v5) or `ioredis` clients with lazy-once auto-connect — no explicit `connect()` required.
- Custom backends: implement `RedisLike` (`set / get / del / scanPrefix`) from `@nestjs-crud/core/cache`.
- `CrudConfigService.load({ query: { cacheStrategy } })` global wiring + per-CrudService constructor override.
- `?cache=0` per-request bypass. Auto-invalidate-on-write by entity prefix. `cacheErrorPolicy: 'fail-fast' | 'fallback-to-source'` knob.
- TypeORM-native `DataSource.cache` pass-through tagged `@deprecated since v2.2.0` — still works as fallback when `CacheStrategy` not wired.

**Setup:** [Caching wiki](https://github.com/kodjunkie/nestjs-crud/wiki/Caching).

## Stay-On Pin

```json
{
  "dependencies": {
    "@nestjs-crud/core": "^1.0.2",
    "@nestjs-crud/typeorm": "^1.0.2"
  }
}
```

`npm update` continues tracking the v1.0.x line. Bugfix patches continue. Per-version stay-on pins:
- v2.0: `"@nestjs-crud/prisma": "^2.0.0"` + `"@prisma/client": "^5 || ^6"` — escapes Prisma 7 driver-adapter requirement
- v2.1.0: pin `"@nestjs-crud/core": "2.1.0"` (or `~2.1.0`); v2.1.0 line stops receiving patches once v2.2.0 ships
