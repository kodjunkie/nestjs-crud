---
name: nestjs-crud
description: >-
  Use when integrating `@nestjs-crud/*` (v2.x) — wiring TypeORM/Drizzle/MikroORM/Prisma adapters, configuring `@Crud()`/`@CrudAuth()`/`@Override()`, writing DTOs with `CrudValidationGroups`, opting into split-query relation loading, debugging `RequestQueryException`, `CrudCacheNotConfiguredError`, `EBADENGINE` (Node <22), validation-fails-on-update, MikroORM stale-em, savepoint semantics on overridden writes.
---

# @nestjs-crud

Auto-generates RESTful CRUD endpoints for NestJS controllers from a single `@Crud()` decorator. Four adapters: TypeORM, Drizzle, MikroORM, Prisma. Node 22+. [CHANGELOG](https://github.com/kodjunkie/nestjs-crud/blob/master/CHANGELOG.md).

## Install

```bash
# Pick one or more adapters
npm install @nestjs-crud/core @nestjs-crud/typeorm
npm install @nestjs-crud/core @nestjs-crud/drizzle
npm install @nestjs-crud/core @nestjs-crud/mikro-orm

# Prisma (v2.1.0+ requires a Prisma 7 driver adapter):
npm install @nestjs-crud/core @nestjs-crud/prisma @prisma/adapter-pg pg          # Postgres
npm install @nestjs-crud/core @nestjs-crud/prisma @prisma/adapter-mariadb mariadb # MySQL
npm install -D prisma                                                             # CLI

# Optional frontend query builder
npm install @nestjs-crud/request
```

Peers declared on every package; `npm install` warns if missing. Node 22+ enforced via `engines.node`. Swagger optional — install `@nestjs/swagger` to enable metadata; library null-guards every Swagger path when absent.

## Quickstart

Controller + `@Crud()` identical across adapters. Only service constructor differs.

```typescript
@Crud({
  model: { type: User },
  query: {
    limit: 25,
    maxLimit: 100,
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
  constructor(@InjectRepository(User) public usersRepo: EntityRepository<User>) {
    super(usersRepo, User);
  }
}
```

Constructor accepts `EntityManager | EntityRepository<T>` (v2.2.0+). `super(usersRepo, User)` unwraps via `repo.getEntityManager()` internally — resulting em is the same ALS-backed proxy MikroORM injects, so request-scope identity-map isolation is preserved. To pass `EntityManager` directly instead: `constructor(em: EntityManager) { super(em, User); }` — same behavior.

### Prisma service (v2.1.0+ with Prisma 7)

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

Prisma 7 removed env-URL path — driver adapter required. Schema rewrite covered in [v2.1 Migration wiki](https://github.com/kodjunkie/nestjs-crud/wiki/v2.1-Migration). Swap `@prisma/adapter-pg` for `@prisma/adapter-mariadb` on MySQL. 3rd constructor arg = `PrismaCrudServiceConfig` object (logger lives inside).

## Generated Endpoints

| Method | Path | Handler |
|--------|------|---------|
| `GET` | `/users` | `getManyBase` |
| `GET` | `/users/:id` | `getOneBase` |
| `POST` | `/users` | `createOneBase` |
| `POST` | `/users/bulk` | `createManyBase` |
| `PATCH` | `/users/:id` | `updateOneBase` |
| `PUT` | `/users/:id` | `replaceOneBase` |
| `DELETE` | `/users/:id` | `deleteOneBase` |
| `POST` | `/users/:id/recover` | `recoverOneBase` |

## Global Defaults — `CrudConfigService.load()`

Set project-wide defaults in `main.ts` BEFORE `NestFactory.create`. Every `@Crud()` deep-merges; controller scalars win, arrays replace.

```typescript
CrudConfigService.load({
  query: { limit: 25, maxLimit: 100, alwaysPaginate: true, cache: 2000 },
  routes: { updateOneBase: { allowParamsOverride: false } },
  params: { id: { field: 'id', type: 'number', primary: true } },
  serialize: { getMany: false },
  auth: { property: 'user' },
});
```

## Query Params (Frontend → Backend)

```typescript
const qb = RequestQueryBuilder.create()
  .setFilter({ field: 'isActive', operator: CondOperator.EQUALS, value: true })
  .setOr({ field: 'role', operator: CondOperator.IN, value: ['admin', 'mod'] })
  .setJoin({ field: 'profile' })
  .sortBy({ field: 'createdAt', order: 'DESC' })
  .setLimit(20)
  .setPage(2);

fetch(`/users?${qb.query()}`);
```

**23 operators** (`CondOperator` enum):

- Equality / comparison: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`
- Range / null: `$between`, `$isnull`, `$notnull`
- Set: `$in`, `$notin`
- String match: `$cont`, `$excl`, `$starts`, `$ends`
- Case-insensitive variants: `$eqL`, `$neL`, `$inL`, `$notinL`, `$contL`, `$exclL`, `$startsL`, `$endsL`

Raw form: `?filter=name||$cont||john&sort=createdAt,DESC&join=profile&limit=25&page=2`

## `@Crud()` Key Options

```typescript
@Crud({
  model: { type: Entity },                                // required

  dto: { create: CreateDto, update: UpdateDto, replace: ReplaceDto },
  serialize: { getMany: ListResponse, get: ItemResponse },

  query: {
    limit: 25, maxLimit: 100,
    cache: 2000,                                          // ms — see §Caching
    alwaysPaginate: false,
    softDelete: false,                                    // enables recoverOneBase
    relationLoadStrategy: 'join',                         // TypeORM only — see §Split-Query
    join: { rel: { eager: true, allow: ['id', 'name'], exclude: ['secret'], required: false } },
    filter: [{ field: 'deletedAt', operator: '$isnull' }],
    sort: [{ field: 'id', order: 'ASC' }],
    exclude: ['password'],
  },

  routes: { exclude: ['createManyBase'], updateOneBase: { allowParamsOverride: false } },
  params: { id: { field: 'id', type: 'uuid', primary: true } },
  swagger: { tag: 'Users', tagWithVersion: true },
  validation: { whitelist: true },
  serviceProperty: 'usersService',                        // v2.2.0+ — defaults 'service'
})
```

`recoverOneBase` requires `query.softDelete: true` + soft-delete column on entity. Full reference: [Controllers wiki](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers).

## Scoping Requests Per User (`@CrudAuth`)

```typescript
@Crud({ model: { type: Post } })
@CrudAuth({
  property: 'user',
  filter: (user: User) => ({ authorId: { $eq: user.id } }),
  persist: (user: User) => ({ authorId: user.id }),
})
@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostsController implements CrudController<Post> {
  constructor(public service: PostsService) {}
}
```

- `filter` — appended to every read
- `persist` — set on every write (prevents spoofing); keys validated at runtime against `entityColumnsHash`; typos throw `RequestQueryException` → 400
- `property` — where to find user on `req` (default `'user'`)

**Guard ordering:** `@UseGuards()` MUST come before `@CrudAuth()` reads `req.user` — place auth guard on the controller class.

## Overriding Generated Routes (`@Override`)

```typescript
@Override('getOneBase')
@UseInterceptors(MyInterceptor)
getUser(@ParsedRequest() req: CrudRequest, @Param('id') id: string) {
  return this.service.getOne(req);
}

@Override('createOneBase')
createUser(@ParsedRequest() req: CrudRequest, @ParsedBody() dto: User) {
  return this.service.createOne(req, dto);
}
```

Use `@ParsedBody()` not `@Body()` — `@Body()` bypasses `class-validator` group selection (CREATE and UPDATE collapse to identical validation).

## IntelliSense — TS errors on generated handlers

`@Crud()` wires handlers at runtime; TypeScript can't see them.

1. **`service` field is untyped** without `implements CrudController<T>` — interface restores typing.
2. **`this.getManyBase(req)` fails typecheck.** Workaround — `base` getter casting `this`:

```typescript
get base(): CrudController<User> { return this; }
```

Most code shouldn't need `base`. Calling `this.service.getMany(req)` from inside `@Override()` is fully typed and idiomatic. Reach for `base` only when composing two generated handlers in one override.

## DTOs — Two Patterns

**Pattern A: Entity-as-DTO (default).** `class-validator` groups on entity:

```typescript
const { CREATE, UPDATE } = CrudValidationGroups;

@Entity()
export class User {
  @IsOptional({ groups: [UPDATE] })
  @IsNotEmpty({ groups: [CREATE] })
  @IsString({ always: true })
  @Column()
  name: string;
}
```

`CREATE` runs on POST + PUT; `UPDATE` on PATCH; `{ always: true }` on both.

**Pattern B: Dedicated DTO classes** via `@Crud({ dto: { create, update, replace } })`. Use when write shape differs meaningfully from entity. With `dto`, `CrudValidationGroups` is NOT used — controller validates against DTO class directly.

Output serialization is separate. Combine entity-in (Pattern A) + DTO-out (`@Crud({ serialize: {...} })`) freely.

**Hand-rolled controllers** (no `@Crud()`) get default ValidationPipe — group decorators silently skip. Wire group pipe explicitly:

```typescript
@Body(new ValidationPipe({ groups: [CrudValidationGroups.CREATE], whitelist: true })) user: User
```

## Strict Field Allowlist (BREAKING in v2)

Every field in `?sort=`, `?filter=`, `?search=`, `?fields=`, `?join=` MUST be entity column OR relation listed in `@Crud({ query: { join: {...} } })`. Otherwise:

```
RequestQueryException: Invalid field 'foo' for entity 'User'
```

Mapped to 400. No opt-out. Common breakages: TypeORM `@VirtualColumn`/`@Formula` fields; client-side aliases; dotted paths against unjoined relations.

## Caching

`@Crud({ query: { cache: <ttl-ms> } })` honored by all four adapters when a `CacheStrategy` is wired (TypeORM-only pre-2.2.0). TTL is milliseconds.

```ts
import { createClient } from 'redis';
import { CrudConfigService } from '@nestjs-crud/core';
import { TypeOrmCacheStrategy } from '@nestjs-crud/typeorm';

const redis = createClient({ url: 'redis://localhost:6379' });
CrudConfigService.load({
  query: { cache: 5000, cacheStrategy: new TypeOrmCacheStrategy(redis) },
});
```

Strategies (`TypeOrm | MikroOrm | Drizzle | PrismaRedis | PrismaAccelerate`) accept `redis` (node-redis v5) or `ioredis` clients with lazy-once auto-connect — no explicit `connect()` required. Custom backends: implement `RedisLike` (`set / get / del / scanPrefix`) from `@nestjs-crud/core/cache`. Writes auto-invalidate by entity prefix. `?cache=0` bypasses per-request. `MockCacheStrategy` for tests.

`@Crud cache` set without strategy (and no TypeORM `DataSource.cache` fallback) → next cached read throws `CrudCacheNotConfiguredError` (plain `Error`). Setup, security, production tuning: [Caching wiki](https://github.com/kodjunkie/nestjs-crud/wiki/Caching).

## Logger

All 4 adapters default to `new Logger(<ServiceName>)` when omitted. TypeORM/Drizzle/MikroORM accept `logger?: LoggerService` as last positional constructor arg. Prisma's logger lives inside `serviceConfig` as `{ error, warn?, debug? }`.

## Transactions on write overrides

`updateOne` / `replaceOne` / `deleteOne` wrap read-modify-write in transaction at **READ COMMITTED** on all 4 adapters — closes lost-update race. Scope: these 3 ops only (`recoverOne` excluded — no prior read).

If you `@Override()` one of these and open your own outer tx, adapter's inner tx becomes a **savepoint** inside yours. Inner READ COMMITTED is best-effort — higher outer isolation (SERIALIZABLE) is NOT downgraded. Rollbacks cascade up.

## Split-Query Relation Loading (TypeORM only)

```typescript
@Crud({
  query: {
    join: { company: { eager: false }, 'company.projects': { eager: false } },
    relationLoadStrategy: 'query', // default: 'join'
  },
})
```

| Strategy | Behavior | When to pick |
|---|---|---|
| `'join'` | Single SQL via manual `leftJoin`/`innerJoin` | Shallow joins; or you depend on `JoinOption.allow` |
| `'query'` | Separate query per relation via `setFindOptions` | Deep multi-relation reads where JOIN cross-products inflate payload |

**Footgun:** under `'query'`, `JoinOption.allow` is ignored — relations load all columns. Don't opt in if you use `allow` to hide sensitive columns. Other adapters (Drizzle, MikroORM, Prisma) use split queries natively — opt-in is no-op.

## Swagger Customization

`@Crud({ swagger: {...} })` controls operation text, tags, examples, error responses, version-aware grouping. Default: imperative summaries, multi-line descriptions, 400/401-if-auth/404 emission, auto `@ApiTags`, auto request-body examples from `@ApiProperty`.

Constraints: `operationId` not overridable; default 401 emission keys off `@CrudAuth` (set `swagger.errorResponses.unauthorized: true` for `APP_GUARD` setups); `synthExample` consumer fn wins over metadata; `@Override()` + manual `@ApiOperation()` wins over `swagger.operations[...]`. Full reference: [Swagger wiki](https://github.com/kodjunkie/nestjs-crud/wiki/Swagger).

## Typed signatures (v2 type tightening)

- **Drizzle:** `protected db: DrizzleClient` (was `any`). Subclass re-declarations conflict — delete and inherit.
- **MikroORM:** 15 `any` sites replaced with `FilterQuery<T>`, `RequiredEntityData<T>`, `EntityMetadata<T>`, `QueryOrderMap<T>`. Untyped callsites need annotations.
- **Core:** `SwaggerEnumType` inlined — no more internal `@nestjs/swagger/dist` imports.

## Best Practices

- Use `CondOperator` enum, not raw operator strings (`'$cont'` silently misspells)
- Use `CrudValidationGroups` constants, not magic strings
- Always `exclude` sensitive fields in `query` config (`?fields=password` returns it without)
- Always `allow`-list join fields on sensitive relations
- Use `search` for AND/OR composition; `filter` is AND-only
- Set `maxLimit` server-side — never trust client `limit` alone

## Common Issues

| Symptom | Cause + Fix |
|---------|-------------|
| Relations not loading | Add to `query.join`. Without it, client join requests silently ignored. |
| `maxLimit` exceeded → 400 | Raise `maxLimit` or set `alwaysPaginate: false`. |
| Validation always fails on update | Fields need `@IsOptional({ groups: [UPDATE] })`. |
| `@CrudAuth` filter not applying | Auth guard must run BEFORE `CrudRequestInterceptor`. Place `@UseGuards()` on class. |
| Flat array instead of `{ data, count, total, page, pageCount }` | Set `alwaysPaginate: true` inside `query:` (NOT top-level). |
| `RequestQueryException: Invalid field 'X'` → 400 | Strict allowlist. Add to entity columns, whitelist via `@Crud({ query: { allow: [...] } })`, or join the relation. |
| `RequestQueryException: Invalid persist key 'X'` → 400 | Typo in `@CrudAuth({ persist: {...} })` against entity column. |
| `EBADENGINE` on `npm install` | Node <22. Upgrade or pin to `^1.0.2`. |
| `CrudCacheNotConfiguredError` | `@Crud cache` set but no `CacheStrategy` wired (and no TypeORM `DataSource.cache` fallback). |
| `Cannot find module 'typeorm'` / `repo.createQueryBuilder is not a function` | Adapter peer not installed. |
| Swagger metadata empty | `@nestjs/swagger` not installed. Library null-guards skip Swagger setup; install + restart. |
| Unexpected SERIALIZABLE inside outer tx, or rollback cascade | Consumer `@Override()` wrapped in outer tx; adapter adds inner savepoint at READ COMMITTED. Decide: remove the wrap, or accept savepoint nesting. |
| Split-query: relation columns include columns NOT in `JoinOption.allow` | Documented divergence — `setFindOptions` doesn't expose alias-level select control. Stay on `'join'` for sensitive relations. |
| Prisma: `Unknown argument 'where'` on `include: { rel: { where: ... } }` | Prisma rejects `where` inside `include` for to-one relations. Filter at parent `where`. Adapter handles SCondition dotted paths on to-one this way automatically. |
| Prisma: deep includes feel slow / N+1-looking logs | Prisma default is query decomposition. Opt into Prisma's `relationJoins` preview on your own `PrismaClient`. |
| Prisma: `createMany` returns fewer fields than TypeORM equivalent | Adapter uses `$transaction([create, ...])` array form for full-record parity. If you see v1 behavior, verify v2. |
| MikroORM: stale entity across requests / `em.flush()` doesn't persist | Subclass cached `em` at constructor time. `MikroOrmFetchHelper` takes `getEm: () => EntityManager` thunk — always call `this.getEm()` fresh; never store `em` as field. |
| MikroORM: Jest ESM error | Use `yarn test:mikro-orm` — has `NODE_OPTIONS=--experimental-vm-modules` inline. Direct `npx jest` fails. |
| TS: `Argument of type 'any' is not assignable to parameter of type 'X'` | MikroORM type tightening. Add explicit annotation (`FilterQuery<T>`, `RequiredEntityData<T>`). |
| TS: `Type 'any' is not assignable to type 'DrizzleClient'` | Remove `protected db: any` re-declaration; inherit typed field from base. |
