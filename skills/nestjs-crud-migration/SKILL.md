---
name: nestjs-crud-migration
description: >-
  Use when migrating `@nestjs-crud/*` v1.0.x → v2.x — the v2.0 strict allowlist break,
  deleted subclass internals, type tightening, write-path transactions; the v2.1 Prisma 7
  driver-adapter switch (`schema.prisma` `datasource.url` removal, `prisma.config.ts`
  forwarding, dropped `--skip-generate`, `adapter-pg` `search_path` landmine,
  `adapter-mariadb` session-state landmine); the v2.1.1 swagger v3-gate cleanup; the v2.2.0
  unified caching API; v2.2.0 opt-in cursor pagination; or v2.3 (NestJS 12, TypeORM 1.x,
  node-redis 6, `@nestjs-crud/core` 2.2.6 floor, `@mikro-orm/sql` peer, nested-join 400s).
  Also for v2 upgrade errors: `RequestQueryException`,
  `CrudCacheNotConfiguredError`, `setSearchCondition is not a function`, `count is not a
  function`, MikroORM stale-em, Prisma `Unknown argument 'where'` inside include, `Invalid
  join`, npm `ERESOLVE` on `ioredis`, or cursor 400s (`single sort field` / `requires a
  limit` / `Invalid cursor`).
---

# @nestjs-crud Migration

Consumer playbook for v1 → v2 and within-v2 upgrades. Stay on v1.0.x: pin `^1.0.2` (see Stay-On Pin §). v2.0 = single coordinated breaking release; v2.1 narrows Prisma peer to v7; v2.1.1 = security/dead-code patch; v2.2.0 = unified caching API + opt-in cursor pagination (both additive); v2.3 = peer-range widening + floor raises + nested-join 400s (§v2.2.x → v2.3.0).

Runtime detail (operator reference, `@CrudAuth` shape, Caching setup, MikroORM em-thunk) lives in `nestjs-crud` SKILL. This playbook covers the **upgrade delta** only.

## Pre-Upgrade Audit (greps to run first)

```bash
# 1. Query params with fields that may not be in the entity allowlist (strict allowlist throws)
grep -rE "sort=|filter=|search=|fields=" src/ test/

# 2. Subclass overrides of deleted internals (§B)
grep -rE "(setSearchCondition|setAndWhere|setOrWhere|setJoin|getRelationMetadata|checkSqlInjection|mapSort|getFieldWithAlias|getSort)\s*\(" src/

# 3. Custom translators — must implement count() + findOneOrFail()
grep -rE "implements QueryTranslator<|extends TypeOrmQueryTranslator" src/

# 4. MikroORM subclasses caching `em` (stale identity-map risk)
grep -rE "this\.em\s*=|private\s+(readonly)?\s*em:\s*EntityManager" src/

# 5. Runtime mutation of deleted fields
grep -rE "\.(sqlInjectionRegEx|entityRelationsHash)\s*=" src/

# 6. Mid-tier subclass overrides whose shape changed in v2
grep -rE "(doGetMany|createBuilder|prepareEntityBeforeSave|getSelect)\s*\(" src/

# 7. Drizzle subclasses typing `protected db: any`
grep -rE "protected\s+db\s*:\s*any|extends\s+DrizzleCrudService" src/

# 8. MikroORM subclasses overriding public methods (typed return signatures now)
grep -rE "extends\s+MikroOrmCrudService|override\s+(getMany|getOne|createOne|createMany|updateOne|replaceOne|deleteOne|recoverOne)" src/

# 9. Internal swagger imports (SwaggerEnumType inlined v2; getSwaggerVersion/swaggerPkgJson removed v2.1.1)
grep -rE "from\s+['\"]@nestjs/swagger/dist/types/swagger-enum\.type['\"]|SwaggerEnumType|getSwaggerVersion|swaggerPkgJson" src/

# 10. Consumer @Override on updateOne/replaceOne/deleteOne (transaction-nesting audit)
grep -rE "@Override\(\)\s*(async\s+)?(updateOne|replaceOne|deleteOne)" src/

# 11. @CrudAuth persist key usage (runtime validation throws on typos in v2)
grep -rE "@CrudAuth|CrudAuth\s*\(\s*\{" src/

# 12. @Crud cache option (without DataSource cache or CacheStrategy → fail-fast)
grep -rE "cache:\s*[0-9]+|cache:\s*true" src/

# 13. Node version
node --version  # must be >=22.12; install refuses otherwise

# 14. Swagger snapshot tests or direct operationsMap import (v2 rewrites text + changes internal shape)
grep -rE "toMatchSnapshot.*swagger|toMatchSnapshot.*apioperation|Swagger\.operationsMap" src/ test/
```

| Hit | Action |
|-----|--------|
| #1 | Audit allowlist (§A) |
| #2-#4, #7-#8 | Subclass migration (§B-§C) |
| #5 | Runtime field-mutation — re-implement via new interfaces (§B) |
| #6 | Mid-tier override on a method whose shape changed — audit against v2 source (§B) |
| #9 | Drop deleted swagger imports (§C) |
| #10 | Audit transaction nesting (§D) |
| #11 | Audit `persist` keys against entity columns |
| #12 | Wire `CacheStrategy` (v2.2.0) or remove `cache` option |
| #13 fail | Upgrade Node 22+ or stay on v1.0.x |
| #14 | Swagger snapshot drift / `operationsMap` shape — re-record OR pin v1 wording via `swagger.operations` (§D) |

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
| **Write-path transactions** READ COMMITTED on update/replace/deleteOne | Low normal; medium with consumer outer-tx | §D |
| **Cache fail-fast** — `@Crud cache` without backend → throws | Medium (was silent in v1) | §D |
| **Swagger default text rewrite** + `Swagger.operationsMap` shape change | Snapshot-test consumers only | §D |
| **`engines.node: ">=22.12"`** | Install refuses on Node <22.12 | §E |

## §A. Strict Column-Name Allowlist

**Most consumers feel v2 here first.** Field names in `?sort/?filter/?search/?fields` MUST be in the entity's per-adapter column allowlist (TypeORM `entityColumnsHash`, Drizzle `columnsMap`, MikroORM `propertiesMap`, Prisma `entityColumns`) OR a relation registered in `@Crud({ query: { join: {...} } })`. Otherwise 400.

| | v1.x | v2.0 |
|---|------|------|
| Validation | Denylist regex | **Allowlist** from per-adapter column source |
| Unknown field | Silent 200 OK (typo → empty result) | **400** |
| Backing regex | `sqlInjectionRegEx` (per-adapter) | Deleted; `InputSanitizer` is sole path |
| Opt-out | — | **None** |

**Common breakages:** column typos; TypeORM `@VirtualColumn`/`@Formula` not in metadata; dotted paths (`?sort=author.name`) without explicit `?join=author` AND `@Crud({ query: { join: { author: {} } } })` registration.

## §B. Deleted Service Internals

Subclass-override consumers only. Standard usage (extending for DI wiring) unaffected.

| v1 surface (deleted) | v2 replacement |
|---------------------|----------------|
| `setSearchCondition` / `setAndWhere` / `setOrWhere` | `TypeOrmQueryTranslator.buildWhere` |
| `setJoin` / `getRelationMetadata` | `TypeOrmJoinResolver.applyJoins` |
| `checkSqlInjection` | `InputSanitizer.assert(field)` |
| `mapSort` / `getFieldWithAlias` / `getSort` | `TypeOrmQueryComposer` (`@internal`) |
| `prepareEntityBeforeSave` / `getSelect` / `findOneOrFail` | Retained as 1-line delegators |

**Deleted fields:** `sqlInjectionRegEx` (no replacement); `entityRelationsHash` (moved to `TypeOrmJoinResolver`).

**Custom `QueryTranslator<Q, W>` implementations** must add 2 methods:

```typescript
// Pattern A — standalone implements (full interface contract)
class MyTranslator implements QueryTranslator<SelectQueryBuilder<T>, ObjectLiteral> {
  count(qb: SelectQueryBuilder<T>): Promise<number> { return qb.getCount(); }
  findOneOrFail(qb: SelectQueryBuilder<T>, opts: { id: unknown }): Promise<T> {
    return qb.where('id = :id', { id: opts.id }).getOneOrFail();
  }
  // ... existing methods ...
}

// Pattern B — extend the bundled translator (most consumers; count + findOneOrFail inherited)
class MyTranslator<T extends ObjectLiteral> extends TypeOrmQueryTranslator<T> {
  override buildWhere(search: SCondition): Brackets | undefined {
    return super.buildWhere(search);  // or customize
  }
  // count() + findOneOrFail() inherited — no need to re-implement unless customizing
}
```

Common errors: `TypeError: this.translator.count is not a function`, `TypeError: this.translator.findOneOrFail is not a function`.

**MikroORM `getEm: () => EntityManager` thunk contract.** `MikroOrmFetchHelper` resolves `em` fresh per call. Subclasses MUST call `this.getEm()` inside every method; **never cache `em` as field** — re-introduces cross-request identity-map bug.

**Internal piece interfaces** (`WhereBuilder<Q,W>` / `QueryComposer<Q>` / `FetchHelper<Q>`) live in `@nestjs-crud/core/query` subpath, marked `@internal`. Public `QueryTranslator<Q,W>` contract unchanged.

## §C. Type Tightening

- **Drizzle:** `protected db: DrizzleClient` (was `any`). Subclasses re-declaring `protected db: any` conflict with base. Fix: delete the re-declaration, inherit.
- **MikroORM:** 15 `any` sites on public method signatures → typed generics (`FilterQuery<T>`, `RequiredEntityData<T>`, `EntityMetadata<T>`, `QueryOrderMap<T>`). Subclass callsites passing untyped values need explicit annotations.
- **Core:** `SwaggerEnumType` inlined — no more `@nestjs/swagger/dist/types/swagger-enum.type` import. Replace with: `string[] | number[] | (string | number)[] | Record<number, string>`.
- **v2.1.1 cleanup:** `getSwaggerVersion` and `swaggerPkgJson` removed from `@nestjs-crud/core` exports (internal v3-gate helpers). Delete imports if you had them; no replacement (`safeRequire` inside library handles missing swagger).

## §D. Behavior Changes

**Logger.** v1 silent-no-op default → v2 `new Logger(<ServiceName>)` by default on all 4 adapters. If you relied on v1 silence: pass explicit no-op logger via constructor (Prisma: `serviceConfig.logger`). **Never interpolate `err.message` in logs** — DB drivers leak SQL parameter values; emit `err.name` + `err.stack` as 2nd arg.

**`@CrudAuth` persist runtime validation.** v1 silently ignored typos in `persist` (auth-filter bypass on writes). v2 validates each persist key against entity columns; typos → 400 `@CrudAuth persist: invalid key(s) "X" — not columns on the target entity`.

**Write-path transactions.** `updateOne` / `replaceOne` / `deleteOne` wrap read-modify-write at READ COMMITTED on all 4 adapters. `recoverOne` excluded. **Transaction nesting:** if you `@Override()` and open an outer tx, adapter's inner tx becomes a savepoint inside yours; outer SERIALIZABLE NOT downgraded; rollbacks cascade. Decide: remove outer wrap, or accept savepoint nesting.

| Adapter | Primitive |
|---------|-----------|
| TypeORM | `QueryRunner` + `startTransaction('READ COMMITTED')` |
| Drizzle | `db.transaction(..., { isolationLevel: 'read committed' })` |
| MikroORM | `em.transactional(..., { isolationLevel: READ_COMMITTED })` |
| Prisma | `$transaction(..., { isolationLevel: 'ReadCommitted' })` |

**Cache fail-fast.** `@Crud({ query: { cache } })` without a `CacheStrategy` (and no TypeORM `DataSource.cache` fallback) throws `CrudCacheNotConfiguredError` at the first cached read. Wire a strategy (v2.2.0 §) or remove `cache` from `@Crud()`.

**Swagger default text rewrite.** v2 rewrites all 8 generated routes' summaries + descriptions. Runtime-additive — but **snapshot-test consumers will drift**. Re-record OR pin v1 wording via `@Crud({ swagger: { operations: { getManyBase: { summary: 'Retrieve multiple Users' } } } })`. `Swagger.operationsMap` shape changed `string` → `{ summary, description }` tuples.

**TypeORM split-query opt-in.** `@Crud({ query: { relationLoadStrategy: 'query' } })` opts into per-relation queries. Footgun: `JoinOption.allow` is ignored under `'query'` (TypeORM's `setFindOptions` doesn't expose alias-level select). Don't opt in if you use `allow` to hide sensitive columns.

## §E. Packaging

- All packages declare `"engines": { "node": ">=22.12.0" }` (NestJS 12 is ESM-only and loads via Node's `require(esm)`, which arrives at 22.12). `npm install` refuses on Node <22.12.
- `peerDependencies` declared on every adapter package. Install warns if peers missing.
- `@nestjs/common` peer range: `^10.0.0 || ^11.0.0` (v2.0+); `|| ^12.0.0` added in v2.3.
- v2.1.1+: `@nestjs/swagger` declared as optional `peerDependency` on `@nestjs-crud/core` (`peerDependenciesMeta.optional: true`); consumers without swagger get no install warning.

## §F. `@nestjs-crud/prisma` (additive in v2.0)

Net-new package. Zero migration impact for existing consumers.

```bash
npm install @nestjs-crud/prisma @prisma/client
npm install -D prisma
# v2.1.0+ also requires a driver adapter — see v2.0 → v2.1 below
```

**Prisma-specific behaviors** (consumer-visible):
- Default relation strategy = query decomposition (1 + N_depth queries), NOT SQL JOIN. Opt into `relationJoins` preview on your `PrismaClient` for native joins.
- `where` inside `include` rejected for to-one relations. Filter at parent `where`. Adapter handles SCondition dotted paths on to-one this way automatically.
- `createMany` uses `$transaction([create, ...])` for full-record return parity (slower; returns full records).

Service ctor: see `nestjs-crud` SKILL §Quickstart. CI matrix: 4 adapters × 2 DBs = 8 cells + parity + no-swagger sentinel.

## §G. What Does NOT Change

`@Crud()` decorator signature, 8 endpoint paths, `@Override`/`@ParsedRequest`/`@ParsedBody`, `@CrudAuth`, `RequestQueryBuilder` + `CondOperator`, `CrudValidationGroups`, `CrudConfigService.load`, public `QueryTranslator<Q,W>` interface, `getMany`/`getOne`/etc return shapes. If you only use the public surface: audit column references in query params, then bump.

**Cursor pagination is opt-in (v2.2.0+):** offset-mode response shape (`{ data, count, total, page, pageCount }`) preserved bit-for-bit. Existing routes without `pagination: 'cursor'` see no behavior change.

## v2.0 → v2.1 — Prisma 7 driver adapter

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
| `prisma generate`: `The property url on the datasource block is not allowed` | v5-shaped schema on v7 | Drop `url = env(...)` from every `datasource` block (wiki §1) |
| `prisma db push`: `The datasource.url property is required in your Prisma config file` | Missing `prisma.config.ts` forwarding `DATABASE_URL` | Add `prisma.config.ts` forwarding env into `datasource.url` (wiki §2) |
| `prisma db push`: `Unknown argument '--skip-generate'` | v7 hard-removed the flag | Drop the flag — `db push` auto-generates now (wiki §3) |
| `new PrismaClient()` throws `datasourceUrl` mismatch | v7 rejects `datasourceUrl` against v7 schemas; no implicit env read | Wire driver adapter: `new PrismaClient({ adapter: new PrismaPg(...) })` for Postgres; `new PrismaMariaDb(url)` for MySQL (wiki §4) |
| Postgres: tables in `public` despite `?schema=custom` | `@prisma/adapter-pg` does NOT run `SET search_path` on connect (undocumented) | Pass libpq `options=-c search_path=<schema>` in pg `PoolConfig` AND `schema` as 2nd `PrismaPg` arg (wiki gotcha 1) |
| MySQL: `SET FOREIGN_KEY_CHECKS=0; TRUNCATE` fails | `@prisma/adapter-mariadb` dispatches each call on fresh pool checkout — session SETs don't persist (undocumented) | Use dependency-ordered `DELETE FROM` + `ALTER TABLE ... AUTO_INCREMENT = 1`; replay `SET SESSION` via mariadb pool's `initSql` (wiki gotcha 2) |

## v2.1.0 → v2.1.1

Security + dead-code patch. Near-zero consumer impact for standard usage.

- 22 dev-tree GHSAs closed via root `resolutions`.
- `@nestjs/swagger` declared as optional `peerDependency` on `@nestjs-crud/core`.
- `getSwaggerVersion` / `swaggerPkgJson` removed (delete imports if you had them; no replacement).
- Dropped `swagger.ApiProperty || swagger.ApiModelProperty` fallback (`ApiModelProperty` deprecated since 2018; v2.x peer floor `^10` makes it unreachable).

## v2.1.1 → v2.2.0 — Caching API (additive)

Backward-compatible. **No migration steps required.** Existing `@Crud({ query: { cache } })` consumers see no behavior change unless they wire a `CacheStrategy`.

**What's new:**
- `CacheStrategy` interface in `@nestjs-crud/core/cache` honored by all 4 adapters (was TypeORM-only pre-2.2.0).
- Strategies (`TypeOrm | MikroOrm | Drizzle | PrismaRedis | PrismaAccelerate`) accept `redis` (node-redis v5) or `ioredis` clients with lazy-once auto-connect — no explicit `connect()` required.
- Custom backends: implement `RedisLike` (`set / get / del / scanPrefix`) from `@nestjs-crud/core/cache`.
- Layered override path: `CrudConfigService.load({ query: { cacheStrategy } })` global → per-CrudService ctor override → `@Crud({ query: { cache } })` per-route → `?cache=0` per-request bypass.
- Auto-invalidate-on-write by entity prefix.
- New `cacheErrorPolicy: 'fail-fast' | 'fallback-to-source'` knob.
- TypeORM-native `DataSource.cache` pass-through tagged `@deprecated since v2.2.0` — still works as fallback when `CacheStrategy` not wired.

**Setup:** [Caching wiki](https://github.com/kodjunkie/nestjs-crud/wiki/Caching).

## v2.1.1 → v2.2.0 — Cursor pagination (additive, opt-in)

Backward-compatible. **No migration steps required.** Default pagination remains `'offset'` (offset response shape preserved bit-for-bit). Consumers opt in per-controller:

```typescript
@Crud({
  model: { type: User },
  query: { pagination: 'cursor', limit: 25 },
})
@Controller('users')
export class UsersController { constructor(public service: UsersService) {} }
```

`getManyBase` then returns `{ data, count, cursor: { next, prev } }`. Forward: `GET /users?sort=id,ASC` → `body.cursor.next`. Back: `GET /users?sort=id,ASC&cursor=<prev>`. Per-route override via `query.pagination`; controller default via `CrudOptions.pagination`.

New errors consumers may hit AFTER opting in:

| Error | Cause | Fix |
|-------|-------|-----|
| `Cursor pagination supports a single sort field` → 400 | Multi-sort + cursor mode | Use one sort field |
| `Cursor pagination requires a limit` → 400 | Cursor mode without `query.limit` or `maxLimit` | Set a limit |
| `Cursor sort field mismatch` → 400 | Client sent cursor encoded against different sort field than current request | Match `?sort=` to the field that issued the cursor |
| `Invalid cursor` → 400 | Tampered or malformed cursor | Re-fetch first page |
| `Cursor token exceeds maximum length` → 400 | Cursor longer than 1024 characters | Re-fetch first page |

Cursor is opaque base64url JSON, **NOT signed** — keep authorization in `@CrudAuth`. Cursor mode bypasses the cache wrap (per-cursor cardinality unbounded); pair with `@nestjs/throttler` on hot endpoints. Setup + tradeoffs: [Cursor Pagination wiki](https://github.com/kodjunkie/nestjs-crud/wiki/CursorPagination).

## v2.2.x → v2.3.0 — Peer ranges + nested-join rules

Upgrade every `@nestjs-crud/*` package together. Code changes only if you use nested joins.

| Peer | v2.2.x | v2.3.0 | Consumer impact |
|------|--------|--------|-----------------|
| `@nestjs/common` (+ `@nestjs/typeorm` on typeorm) | `^10 \|\| ^11` | `+ ^12.0.0` | NestJS 12 is ESM-only; packages stay CJS → Node 22.12+ (`require(esm)`); Jest needs `NODE_OPTIONS=--experimental-vm-modules` |
| `@nestjs/swagger` (optional, core) | `^10 \|\| ^11 \|\| ^12` | `^7 \|\| ^8 \|\| ^11 \|\| ^12` | `^10` never existed on npm; the corrected range's `^7`/`^8` pair with NestJS 10 |
| `typeorm` | `^0.3.0` | `^0.3.30 \|\| ^1.0.0` | Below 0.3.30 → peer warning; bump TypeORM |
| `redis` (adapters) | `^5.0.0` | `^5.0.0 \|\| ^6.0.0` | node-redis 6 clients work unchanged |
| `ioredis` (optional, adapters) | `^5.0.0` | `^5.0.0 \|\| ^6.0.0` | ioredis 6 clients now accepted |
| `class-validator` (core) | `^0.14.0` | `^0.14.0 \|\| ^0.15.0` | 0.15.x no longer warns |
| `@nestjs-crud/core` on adapters (+ `request`/`util` on mikro-orm) | `^2.0.0` | `^2.2.6` | Older core → peer warning |
| `@mikro-orm/sql` (mikro-orm) | — | `^7.0.0` (new) | Every MikroORM 7 SQL driver already depends on it; fixes adapter `.d.ts` importing undeclared `@mikro-orm/knex` |
| `drizzle-orm` (drizzle) | `>=0.45.2` | `^0.45.2` | Unbounded range now capped; drizzle-orm 1.x is prerelease-only, not yet supported |

`RequestQueryParser.parseQuery()` also accepts a raw query string (additive); `@nestjs-crud/core` no longer depends on `qs` directly.

**Nested joins.** An orphan nested `?join=` entry is one whose parent is neither requested nor eager. It now returns 400 `Invalid join: '<field>'` on all 4 adapters. Before, TypeORM returned 500 and the other adapters silently dropped the join. Fix clients by adding the parent to `?join=`, or mark the parent eager. Under TypeORM `relationLoadStrategy: 'query'`, a nested join needs its full dotted path as a `query.join` key; the parent no longer loads implicitly. An eager nested key with a non-eager ancestor makes `@Crud()` throw at startup.

## Common v2 Upgrade Errors

Migration-only — runtime issues live in `nestjs-crud` SKILL §Common Issues.

| Error / symptom | Cause | Fix |
|-----------------|-------|-----|
| 400 `Field "X" is not allowed` (adapter variants: `Invalid field: 'X'`, `Invalid sort field: 'X'`, `Unknown column: X`) | Field not in entity column allowlist | Add `@Column()`, register virtual field, or remove from query param |
| 400 `Invalid relation in sort: 'Y'` (TypeORM) / `Unknown relation: Y` (Prisma) | Dotted path with unknown relation | Add `?join=Y` AND register in `@Crud({ query: { join: { Y: {} } } })` |
| `TypeError: this.checkSqlInjection is not a function` | Subclass called deleted private | `this.sanitizer.assert(field)` |
| `TypeError: this.setSearchCondition is not a function` | Subclass called deleted protected | Override `TypeOrmQueryTranslator.buildWhere` |
| `TypeError: this.translator.count is not a function` | Custom translator missing `count()` | `count(qb)`: `return qb.getCount()` for TypeORM |
| `TypeError: this.translator.findOneOrFail is not a function` | Custom translator missing method | Add `findOneOrFail(qb, opts)` per `TypeOrmQueryTranslator` reference |
| `Cannot read properties of undefined (reading 'entityRelationsHash')` | Field moved | Now per-`TypeOrmJoinResolver` instance — access via `this.joinResolver` |
| `Class 'X' incorrectly implements interface 'QueryTranslator<Q, W>'. Missing: count, findOneOrFail` | Pre-v2 custom translator | Add both methods |
| TS: `Type 'any' is not assignable to type 'DrizzleClient'` | Drizzle subclass field re-declaration | Remove `protected db: any`; inherit |
| TS: `Argument of type 'any' is not assignable to parameter of type 'X'` | MikroORM type tightening | Annotate with `FilterQuery<T>`/`RequiredEntityData<T>` |
| `Module '"@nestjs-crud/core"' has no exported member 'getSwaggerVersion'` / `swaggerPkgJson` | Removed in v2.1.1 | Delete imports — no replacement |
| 400 `@CrudAuth persist: invalid key(s) "X"` | Typo in `@CrudAuth({ persist })` against entity column | Fix key |
| `CrudCacheNotConfiguredError` on first cached read | `@Crud cache` set but no strategy/backend | Wire `CacheStrategy`, configure TypeORM `DataSource.cache`, or remove `cache` |
| `Property 'summary' does not exist on type 'string'` on `Swagger.operationsMap(...)` | Internal API shape changed `string` → `{ summary, description }` | Destructure, or switch to `@Crud({ swagger: { operations: {...} } })` |
| Swagger snapshot tests fail | v2 rewrites default summaries + descriptions | Re-record OR pin v1 wording via `swagger.operations` |
| Unexpected SERIALIZABLE inside outer tx, or rollback cascade | Adapter inner tx is savepoint inside your outer | Remove outer wrap or accept savepoint nesting |
| Prisma service emits logs when it didn't before | v2 unified default — `serviceConfig.logger` omitted = `new Logger(...)` | Pass explicit no-op logger via `serviceConfig.logger` |
| 400 `Invalid join: 'a.b'` (v2.3) | Nested join without parent `a` joined | Add `a` to `?join=` or mark it eager |
| Startup: `@Crud: eager join 'a.b' on X needs 'a' to be eager too` (v2.3) | Eager nested key, non-eager ancestor | Mark `a` eager or drop `eager` from `a.b` |
| TS: `Cannot find module '@mikro-orm/knex'` from `@nestjs-crud/mikro-orm` types | v2.2.x `.d.ts` imported an undeclared package | Upgrade to v2.3 (types from `@mikro-orm/sql`) |
| npm `ERESOLVE` on `ioredis` (TypeORM 1.x + NestJS 12) | TypeORM peers `ioredis@^5`; npm resolves 6 for NestJS 12 | `npm install ioredis@^5` or `"overrides": { "ioredis": "^5.0.4" }` |
| npm install peer warnings | peerDeps declared in v2 | Install peers explicitly |
| `EBADENGINE: Unsupported engine` | Node <22.12 | Upgrade Node 22.12+, or stay on v1.0.x |

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
