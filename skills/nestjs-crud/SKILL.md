---
name: nestjs-crud
description: >-
  Use when integrating `@nestjs-crud/*` (v2.2+) — wiring TypeORM/Drizzle/MikroORM/Prisma adapters,
  configuring `@Crud()`/`@CrudAuth()`/`@Override()`/`@Feature()`/`@Action()`, opt-in cursor
  pagination, ACL/RBAC guards via `getFeature`/`getAction` + `nest-access-control`/CASL, DTOs
  with `CrudValidationGroups`, split-query relation loading, debugging `RequestQueryException`,
  `CrudCacheNotConfiguredError`, `EBADENGINE` (Node <22), validation-fails-on-update,
  MikroORM stale-em, savepoints on overridden writes.
---

# @nestjs-crud

Auto-generates RESTful CRUD endpoints from `@Crud()`. Four adapters: TypeORM, Drizzle, MikroORM, Prisma. Node 22+. [CHANGELOG](https://github.com/kodjunkie/nestjs-crud/blob/master/CHANGELOG.md).

## Install

```bash
npm install @nestjs-crud/core @nestjs-crud/<adapter>     # typeorm | drizzle | mikro-orm | prisma
npm install @nestjs-crud/request                         # optional frontend QB

# All four adapters declare the DB driver as an optional peer — install whichever your backend uses:
npm install pg                                           # Postgres   (typeorm/drizzle/mikro-orm)
npm install mysql2                                       # MySQL      (typeorm/drizzle/mikro-orm)

# Prisma 7 needs a driver adapter:
npm install @prisma/adapter-pg pg                        # Postgres
npm install @prisma/adapter-mariadb mariadb              # MySQL
npm install -D prisma                                    # CLI
```

Swagger optional — install `@nestjs/swagger` to enable metadata; library null-guards every Swagger path when absent.

## Quickstart

`@Crud()` block + `@Controller()` are identical across adapters. Only service ctor differs.

```typescript
@Crud({
  model: { type: User },
  query: {
    limit: 25, maxLimit: 100,
    join: { profile: { eager: true }, posts: { allow: ['id', 'title'] } },
  },
})
@Controller('users')
export class UsersController implements CrudController<User> {
  constructor(public service: UsersService) {}
}
```

### TypeORM service

```typescript
@Injectable()
export class UsersService extends TypeOrmCrudService<User> {
  constructor(@InjectRepository(User) repo: Repository<User>) {
    super(repo);
  }
}
```

### Drizzle service

```typescript
@Injectable()
export class UsersService extends DrizzleCrudService<typeof users.$inferSelect> {
  constructor(@Inject('DB') drizzleDb: typeof db) {
    super(drizzleDb, users); // (db instance, table reference)
  }
}
```

### MikroORM service

```typescript
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';

@Injectable()
export class UsersService extends MikroOrmCrudService<User> {
  constructor(@InjectRepository(User) usersRepo: EntityRepository<User>) {
    super(usersRepo, User);
  }
}
```

Constructor accepts `EntityManager | EntityRepository<T>` (v2.2+). `super(usersRepo, User)` unwraps via `repo.getEntityManager()` internally. The DI-injected em proxy resolves to the per-request forked em via `RequestContext` — request-scope identity-map isolation preserved without effort. To pass `EntityManager` directly: `constructor(em: EntityManager) { super(em, User); }` — same behavior.

### Prisma service (v2.1+ with Prisma 7)

```typescript
const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

@Injectable()
export class UsersService extends PrismaCrudService<User> {
  constructor(@Inject('PRISMA') prisma: PrismaClient) {
    super(prisma, 'user', {
      entityColumns: ['id', 'email', 'isActive', 'companyId', 'deletedAt'],
      primaryColumns: ['id'],
      softDeleteColumn: 'deletedAt',
    });
  }
}
```

Prisma 7 removed the env-URL path — driver adapter required. Schema rewrite covered in [v2.1 Migration wiki](https://github.com/kodjunkie/nestjs-crud/wiki/v2.1-Migration). Swap `@prisma/adapter-pg` for `@prisma/adapter-mariadb` on MySQL. 3rd ctor arg = `PrismaCrudServiceConfig` (logger lives inside).

## Generated Endpoints

| Method | Path | Handler |
|--------|------|---------|
| GET | `/users` | `getManyBase` |
| GET | `/users/:id` | `getOneBase` |
| POST | `/users` | `createOneBase` |
| POST | `/users/bulk` | `createManyBase` |
| PATCH | `/users/:id` | `updateOneBase` |
| PUT | `/users/:id` | `replaceOneBase` |
| DELETE | `/users/:id` | `deleteOneBase` |
| POST | `/users/:id/recover` | `recoverOneBase` (requires `query.softDelete: true`) |

## `@Crud()` Key Options

```typescript
@Crud({
  model: { type: Entity },                                 // required
  dto:        { create, update, replace },                 // optional — see DTOs
  serialize:  { getMany, get },                            // per-route response DTOs

  query: {
    limit: 25, maxLimit: 100,
    pagination: 'offset' | 'cursor',                       // v2.2+ — default 'offset'
    cache: 2000,                                           // ms
    alwaysPaginate: false,
    softDelete: false,                                     // enables recoverOneBase
    relationLoadStrategy: 'join' | 'query',                // TypeORM only
    join:    { rel: { eager, allow, exclude, required } },
    filter:  [{ field, operator, value }],
    sort:    [{ field, order }],
    exclude: ['password'],
  },

  routes:  { exclude: ['createManyBase'], updateOneBase: { allowParamsOverride: false } },
  params:  { id: { field: 'id', type: 'uuid', primary: true } },
  serviceProperty: 'usersService',                         // v2.2+ — defaults 'service'
})
```

Full reference: [Controllers wiki](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers).

## Cursor Pagination (v2.2+, opt-in)

```typescript
@Crud({ query: { pagination: 'cursor', limit: 25 } })
```

Switches `getManyBase` to keyset cursor mode. Response: `{ data, count, cursor: { next, prev } }`. Default `'offset'` preserved (non-breaking).

- Cursor = opaque base64url JSON `{sortField, sortValue, id, dir}`. **NOT signed** — authorization stays in `@CrudAuth`. Cursor opacity ≠ access boundary.
- `@CrudAuth` filter applies BEFORE cursor (auth merges into `parsed.search` at the interceptor; cursor `WHERE` ANDs on top at the service). Cursor pages are subsets of the `@CrudAuth`-filtered result set — same isolation guarantees as offset mode.
- Single sort field + auto-PK tail; multi-sort + cursor → 400. Requires `limit` or `maxLimit` (missing → 400). Tampered/wrong-sort cursor → 400.
- Cursor mode bypasses cache wrap (per-cursor-key cardinality unbounded). On hot endpoints, pair with `@nestjs/throttler`.
- Honored across all 4 adapters via per-adapter `QueryComposer.applyCursor`. Prisma's built-in `cursor:` arg intentionally bypassed (single-column unique-key only).

[Cursor Pagination wiki](https://github.com/kodjunkie/nestjs-crud/wiki/CursorPagination).

## Query Params (Frontend → Backend)

```typescript
RequestQueryBuilder.create()
  .setFilter({ field: 'isActive', operator: CondOperator.EQUALS, value: true })
  .setOr({ field: 'role', operator: CondOperator.IN, value: ['admin'] })
  .setJoin({ field: 'profile' })
  .sortBy({ field: 'createdAt', order: 'DESC' })
  .setLimit(20).setPage(2)
  .query();
```

**23 operators (`CondOperator`):** `$eq $ne $gt $gte $lt $lte $between $isnull $notnull $in $notin $cont $excl $starts $ends` + 8 case-insensitive `*L` variants.

Raw form: `?filter=name||$cont||john&sort=createdAt,DESC&join=profile&limit=25&page=2&cursor=<opaque>`

## Global Defaults

Set project-wide defaults in `main.ts` BEFORE `NestFactory.create`. Every `@Crud()` deep-merges; controller scalars win, arrays replace.

```typescript
CrudConfigService.load({
  query:       { limit: 25, maxLimit: 100, alwaysPaginate: true, cache: 2000, softDelete: false },
  routes:      { updateOneBase: { allowParamsOverride: false, returnShallow: false }, deleteOneBase: { returnDeleted: false } },
  params:      { id: { field: 'id', type: 'number', primary: true } },
  serialize:   { getMany: false },                            // disable serialize globally for list responses
  queryParser: { delimiter: ',' },                            // passed to RequestQueryBuilder.setOptions
  auth:        { property: 'user' },                          // default user property for @CrudAuth
});
```

## `@CrudAuth` — Per-User Scoping

```typescript
@Crud({ model: { type: Post } })
@CrudAuth({
  property: 'user',
  filter:  (u: User) => ({ authorId: { $eq: u.id } }),    // appended to every read
  persist: (u: User) => ({ authorId: u.id }),             // set on every write
  or:      false,                                          // OR-merge filter into search; default false (AND-merge)
})
@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostsController { constructor(public service: PostsService) {} }
```

`persist` keys validated against entity columns at runtime — typos throw `RequestQueryException` → 400.

**Guard ordering:** `@UseGuards()` MUST be on the controller class (runs before `CrudRequestInterceptor` reads `req.user`).

## ACL / RBAC integration

Generated route handlers carry an auto-applied `@Action(CrudActions.<X>)` — values: `Read-All`, `Read-One`, `Create-One`, `Create-Many`, `Update-One`, `Replace-One`, `Delete-One`, `Recover-One`. Tag the controller with `@Feature(name)` and reflect both from a guard via `getFeature(ctx.getClass())` + `getAction(ctx.getHandler())`, then dispatch to your ACL backend (`nest-access-control`, CASL, etc). Full `ACLGuard` example: [Controllers wiki §Additional decorators](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers#additional-decorators).

## `@Override()` — Custom Handlers

```typescript
@Override('getOneBase')
getUser(@ParsedRequest() req: CrudRequest, @Param('id') id: string) {
  return this.service.getOne(req);
}

@Override('createOneBase')
createUser(@ParsedRequest() req: CrudRequest, @ParsedBody() dto: User) {
  return this.service.createOne(req, dto);
}
```

`@Override` accepts: `'getManyBase'`, `'getOneBase'`, `'createOneBase'`, `'createManyBase'`, `'updateOneBase'`, `'replaceOneBase'`, `'deleteOneBase'`, `'recoverOneBase'`.

Use `@ParsedBody()` not `@Body()` in write overrides — `@Body()` bypasses `class-validator` group selection (CREATE and UPDATE validation become identical).

## DTOs — Two Patterns

**Pattern A (default): Entity-as-DTO** with `class-validator` groups:

```typescript
const { CREATE, UPDATE } = CrudValidationGroups;

@IsOptional({ groups: [UPDATE] })
@IsNotEmpty({ groups: [CREATE] })
@IsString({ always: true })
name: string;
```

`CREATE` → POST + PUT; `UPDATE` → PATCH; `{ always: true }` → both.

**Pattern B: Dedicated DTOs** via `@Crud({ dto: { create, update, replace } })`. With `dto`, `CrudValidationGroups` not used — controller validates against the DTO class directly. Combine entity-in (A) + DTO-out (`@Crud({ serialize })`) freely.

### Validation groups: factory vs hand-rolled controllers

`CrudValidationGroups.CREATE` / `UPDATE` only fire when the validator runs with matching `groups`. The `@Crud()` factory binds `new ValidationPipe({ groups: [CREATE | UPDATE], ... })` per generated route automatically. Hand-rolled controllers built without `@Crud()` get the **default** pipe (`groups: undefined`); group-scoped decorators silently skip — required-field validators don't fire.

```typescript
// ✗ Hand-rolled — group-scoped decorators silently skip
@Controller('special')
export class SpecialController {
  @Post('/users')
  createSpecial(@Body() user: User) { ... }  // CREATE-group validators DO NOT run
}

// ✓ Hand-rolled — wire the group pipe explicitly
@Post('/users')
createSpecial(
  @Body(new ValidationPipe({ groups: [CrudValidationGroups.CREATE], whitelist: true })) user: User,
) { ... }
```

Many such routes? Factor a helper. Alternative: switch to dedicated DTOs (Pattern B) without group decorators — they validate identically everywhere.

## Strict Field Allowlist (v2 BREAKING)

Every field in `?sort/?filter/?search/?fields/?join` MUST be entity column OR allow-listed relation. Otherwise: `RequestQueryException: Invalid field 'X'` → 400. No opt-out. Common breakages: TypeORM `@VirtualColumn`/`@Formula` (not in `metadata.columns` — override `protected entityColumnsHash` in subclass to allow), client-side aliases, dotted paths against unjoined relations.

## Caching

`@Crud({ query: { cache: <ttl-ms> } })` honored by all 4 adapters when a `CacheStrategy` is wired (TypeORM-only pre-v2.2). TTL is milliseconds.

```ts
import { createClient } from 'redis';
import { CrudConfigService } from '@nestjs-crud/core';
import { TypeOrmCacheStrategy } from '@nestjs-crud/typeorm';

const redis = createClient({ url: 'redis://localhost:6379' });
CrudConfigService.load({
  query: { cache: 5000, cacheStrategy: new TypeOrmCacheStrategy(redis) },
});
```

Per-CrudService override available via constructor. Per-route override via `@Crud({ query: { cache } })`. Per-request bypass via `?cache=0`.

Strategies: `TypeOrm | MikroOrm | Drizzle | PrismaRedis | PrismaAccelerate`. Accept `redis` (node-redis v5) or `ioredis` clients with lazy-once auto-connect — no explicit `connect()` required. Custom backends: implement `RedisLike` (`set / get / del / scanPrefix`) from `@nestjs-crud/core/cache`. Writes auto-invalidate by entity prefix.

`@Crud cache` set without strategy (and no TypeORM `DataSource.cache` fallback) → `CrudCacheNotConfiguredError` on next cached read. Setup, security, tuning: [Caching wiki](https://github.com/kodjunkie/nestjs-crud/wiki/Caching).

**Cursor mode bypasses cache wrap entirely** (per-cursor-key cardinality unbounded — see §Cursor Pagination). If you opt a route into `pagination: 'cursor'`, the `cache` knob on that route becomes a no-op; pair with `@nestjs/throttler` instead.

## Transactions on Write Overrides

`updateOne` / `replaceOne` / `deleteOne` wrap read-modify-write in tx at READ COMMITTED — closes lost-update race. `recoverOne` excluded (no prior read). If you wrap an `@Override()` in your own outer tx, adapter's inner tx becomes a savepoint inside yours; higher outer isolation NOT downgraded; rollbacks cascade up.

## TypeORM Split-Query Relation Loading

`@Crud({ query: { relationLoadStrategy: 'query' } })` — separate query per relation via `setFindOptions`. **Footgun:** `JoinOption.allow` is ignored; relations load all columns. Don't opt in if you use `allow` to hide sensitive columns. Other adapters use split queries natively; opt-in is no-op.

| Strategy | Behavior | When to pick |
|---|---|---|
| `'join'` | Single SQL via `leftJoin`/`innerJoin` | Shallow joins; or you depend on `JoinOption.allow` |
| `'query'` | Separate query per relation via `setFindOptions` | Deep multi-relation reads where JOIN cross-products inflate payload |

## Swagger Customization

`@Crud({ swagger: {...} })` controls operation text, tags, examples, error responses, version-aware grouping. Defaults: imperative summaries, multi-line descriptions, 400/401-if-auth/404 emission, auto `@ApiTags`, auto request-body examples from `@ApiProperty`.

**Constraints:** `operationId` not overridable; default 401 emission keys off `@CrudAuth` (set `swagger.errorResponses.unauthorized: true` for `APP_GUARD` setups); `synthExample` consumer fn wins over metadata; `@Override()` + manual `@ApiOperation()` wins over `swagger.operations[...]`. Full reference: [Swagger wiki](https://github.com/kodjunkie/nestjs-crud/wiki/Swagger).

## Logger

All 4 adapters default to `new Logger(<ServiceName>)`. TypeORM/Drizzle/MikroORM accept `logger?: LoggerService` as last positional ctor arg. Prisma's logger lives inside `serviceConfig` as `{ error, warn?, debug? }`.

**Emission convention:** `debug` for query traces; `warn` for SQLi rejections + tx rollbacks; `error` for uncaught DB errors. **NEVER interpolate `err.message`** — DB drivers leak SQL parameter values into messages; emit `err.name` as the message and pass `err.stack` as second arg.

## IntelliSense

`@Crud()` wires handlers at runtime; TS can't see them. `implements CrudController<T>` restores `service` typing. From inside `@Override()`, `this.service.getMany(req)` is fully typed and idiomatic. Composing two generated handlers in one override: `get base(): CrudController<User> { return this; }`.

## Best Practices

- Use `CondOperator` enum, not raw strings (`'$cont'` silently misspells)
- Always `exclude` sensitive fields in `query` config (`?fields=password` returns it without)
- Always `allow`-list join fields on sensitive relations
- `search` for AND/OR composition; `filter` is AND-only
- Set `maxLimit` server-side — never trust client `limit`
- Cursor mode on hot endpoints → pair with `@nestjs/throttler` (cache bypass = unbounded cardinality)

## Common Issues

| Symptom | Fix |
|---------|-----|
| Relations not loading | Add to `query.join`. Without it, client join requests silently ignored. |
| `maxLimit` exceeded → 400 | Raise `maxLimit` or set `alwaysPaginate: false`. |
| Validation always fails on update | Fields need `@IsOptional({ groups: [UPDATE] })`. |
| `Cannot find module 'typeorm'` / `Cannot find module 'pg'` / `Cannot find module 'mysql2'` / `repo.createQueryBuilder is not a function` | Adapter ORM or DB driver peer not installed. `npm install typeorm pg` (Postgres) or `npm install typeorm mysql2` (MySQL). All four adapters declare DB drivers as optional peers — pick the one your backend uses. |
| Swagger metadata empty | `@nestjs/swagger` not installed. Library skips Swagger setup; install + restart. |
| `@CrudAuth` filter not applying | `@UseGuards()` must be on controller class (runs before interceptor). |
| Flat array instead of `{ data, count, total, page }` | `alwaysPaginate: true` inside `query:` (NOT top-level). |
| `RequestQueryException: Invalid field 'X'` → 400 | Add to entity columns or `query.join` allow-list. |
| `RequestQueryException: Invalid persist key 'X'` → 400 | Typo in `@CrudAuth({ persist })` against entity column. |
| `EBADENGINE` on `npm install` | Node <22. Upgrade or pin to `^1.0.2`. |
| `CrudCacheNotConfiguredError` | `@Crud cache` set but no `CacheStrategy` wired (and no TypeORM `DataSource.cache` fallback). |
| Swagger metadata empty | `@nestjs/swagger` not installed. Library skips Swagger setup; install + restart. |
| Cursor: `Cursor pagination supports a single sort field` → 400 | Multi-sort + cursor not supported. Use one sort field. |
| Cursor: `Cursor pagination requires a limit` → 400 | Cursor mode needs `query.limit` or `maxLimit`. |
| Cursor: `Invalid cursor` → 400 | Tampered, expired schema, or wrong sort field on this route. |
| MikroORM: stale entity / `em.flush()` doesn't persist | Subclass cached `em` in ctor. Use `getEm()` thunk; never store `em` as field. |
| MikroORM: Jest ESM error | Use `yarn test:mikro-orm` — has `NODE_OPTIONS=--experimental-vm-modules` inline. Direct `npx jest` fails. |
| Prisma: `Unknown argument 'where'` on `include` | Prisma rejects `where` on to-one `include`. Filter at parent `where`. Adapter handles SCondition dotted paths automatically. |
| Outer tx + `@Override()` write: SERIALIZABLE persists, rollback cascades | Adapter inner tx is savepoint inside yours. Decide: remove the wrap or accept savepoint nesting. |
| Split-query: relation loads all columns despite `allow` | `setFindOptions` doesn't expose alias-level select. Stay on `'join'` for sensitive relations. |
