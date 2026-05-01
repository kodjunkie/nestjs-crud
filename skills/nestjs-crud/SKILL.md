---
name: nestjs-crud
description: >-
  Use when integrating `@nestjs-crud/*` (v2.x) into a NestJS project — wiring TypeORM/Drizzle/MikroORM/Prisma adapters, configuring `@Crud()`/`@CrudAuth()`/`@Override()`, writing DTOs with `CrudValidationGroups`, opting into split-query relation loading, debugging `RequestQueryException`, `CrudCacheNotConfiguredError`, `EBADENGINE` (Node <22), validation-fails-on-update, MikroORM stale-em, or savepoint semantics on overridden writes.
---

# @nestjs-crud

Auto-generates RESTful CRUD endpoints for NestJS controllers from a single `@Crud()` decorator. Four adapters: TypeORM, Drizzle, MikroORM, Prisma. Node 22+. See [CHANGELOG](https://github.com/kodjunkie/nestjs-crud/blob/master/CHANGELOG.md) for version history.

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

Peers are declared on every package; `npm install` warns if missing. Node 22+ enforced via `engines.node`. Swagger optional — install `@nestjs/swagger` to enable metadata; library null-guards every Swagger path when absent.

## Quickstart

Controller + `@Crud()` are identical across adapters. Only the service ctor changes.

```typescript
@Crud({
  model: { type: User },
  query: {
    limit: 25,
    maxLimit: 100,
    join: {
      profile: { eager: true },
      posts: { allow: ['id', 'title'] },
    },
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
@Injectable()
export class UsersService extends MikroOrmCrudService<User> {
  constructor(em: EntityManager) {
    super(em, User);
  }
}
```

The DI-injected em proxy resolves to the per-request forked em via `RequestContext` (preserves identity-map isolation without effort).

`MikroOrmCrudService` ctor accepts `EntityManager | EntityRepository<T>` (v2.2.0+) — pass `@InjectRepository(User)` repos directly without unwrapping. The library handles `repo.getEntityManager()` internally; resulting em is the same ALS-backed proxy.

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

Prisma 7 removed the env-URL path — driver adapter is required. Schema rewrite (strip `datasource.url`, add `prisma.config.ts`) covered in the [v2.1 Migration wiki](https://github.com/kodjunkie/nestjs-crud/wiki/v2.1-Migration). Swap `@prisma/adapter-pg` for `@prisma/adapter-mariadb` on MySQL. Prisma's 3rd ctor arg is a `PrismaCrudServiceConfig` object (logger lives inside it, not as a separate arg).

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

Set project-wide defaults once in `main.ts` BEFORE `NestFactory.create`. Every `@Crud()` deep-merges on top; controller scalars win, arrays replace.

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
  model: { type: Entity },                                 // required

  dto: { create: CreateDto, update: UpdateDto, replace: ReplaceDto },  // optional — Pattern B
  serialize: { getMany: ListResponse, get: ItemResponse },             // per-route response DTOs

  query: {
    limit: 25, maxLimit: 100,
    cache: 2000,                                           // ms — see §Caching
    alwaysPaginate: false,
    softDelete: false,                                     // enables recoverOneBase
    relationLoadStrategy: 'join',                          // TypeORM only — see §Split-Query
    join: {
      relation: { eager: true, allow: ['id', 'name'], exclude: ['secret'], required: false },
    },
    filter: [{ field: 'deletedAt', operator: '$isnull' }],  // always-on
    sort: [{ field: 'id', order: 'ASC' }],
    exclude: ['password'],
  },

  routes: {
    exclude: ['createManyBase', 'recoverOneBase'],
    updateOneBase: { allowParamsOverride: false, returnShallow: false },
    deleteOneBase: { returnDeleted: false },
  },

  params: { id: { field: 'id', type: 'uuid', primary: true } },
  swagger: { tag: 'Users', tagWithVersion: true },         // see Swagger wiki
  validation: { whitelist: true },
  serviceProperty: 'usersService',                          // v2.2.0+ — defaults 'service'
})
```

`recoverOneBase` requires `query.softDelete: true` AND a soft-delete column on the entity.

## Scoping Requests Per User (`@CrudAuth`)

```typescript
@Crud({ model: { type: Post } })
@CrudAuth({
  property: 'user',
  filter: (user: User) => ({ authorId: { $eq: user.id } }),
  persist: (user: User) => ({ authorId: user.id }),
  or: false,
})
@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostsController implements CrudController<Post> {
  constructor(public service: PostsService) {}
}
```

- `filter` — appended to every read
- `persist` — set on every write (prevents spoofing)
- `property` — where to find user on `req` (default `'user'`)

**Persist keys validated at runtime** against `entityColumnsHash`. Typos throw `RequestQueryException` → 400 (`Invalid persist key 'X'`). **Guard ordering:** `@UseGuards()` MUST come before `@CrudAuth()` reads `req.user` — place auth guard on the controller class.

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

`@Crud()` wires handlers at runtime; TypeScript can't see them. Two consequences:

1. **`service` field is untyped** without `implements CrudController<T>` — the interface restores typing.
2. **`this.getManyBase(req)` fails typecheck.** Workaround: a `base` getter casting `this`:

```typescript
get base(): CrudController<User> {
  return this;
}
```

Most code shouldn't need `base`. Calling `this.service.getMany(req)` from inside `@Override()` is fully typed and idiomatic. Reach for `base` only when composing two generated handlers inside one override.

## DTOs — Two Patterns

**Pattern A: Entity-as-DTO (default).** `class-validator` groups on the entity:

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

`CREATE` runs on `POST` + `PUT`; `UPDATE` runs on `PATCH`; `{ always: true }` runs on both.

**Pattern B: Dedicated DTO classes** via `@Crud({ dto: { create, update, replace } })`. Use when the write shape differs meaningfully from the entity. With `dto`, `CrudValidationGroups` is NOT used — the controller validates against the DTO class directly.

**Output serialization is separate.** Combine entity-in (Pattern A) + DTO-out (`@Crud({ serialize: {...} })`) freely.

### Validation groups: factory vs hand-rolled

`@Crud()`-generated routes auto-bind `new ValidationPipe({ groups: [CREATE | UPDATE], ... })` per route. Hand-rolled controllers built without `@Crud()` get the default pipe — group-scoped decorators silently skip. Wire the group pipe explicitly:

```typescript
@Post('/users')
createSpecial(
  @Body(new ValidationPipe({ groups: [CrudValidationGroups.CREATE], whitelist: true }))
  user: User,
) { ... }
```

## Strict Field Allowlist (BREAKING in v2)

Every field passed through `?sort=`, `?filter=`, `?search=`, `?fields=`, `?join=` MUST be either an entity column OR a relation listed in `@Crud({ query: { join: {...} } })`. Otherwise:

```
RequestQueryException: Invalid field 'foo' for entity 'User'
```

Mapped to 400. No opt-out. Common breakages: TypeORM `@VirtualColumn`/`@Formula` fields; client-side aliases; dotted paths against unjoined relations.

## Caching

`@Crud({ query: { cache: <ttl-ms> } })` is honored by all four adapters when a `CacheStrategy` is wired (TypeORM-only pre-2.2.0). TTL is milliseconds across the unified contract.

```ts
import { createClient } from 'redis';
import { CrudConfigService } from '@nestjs-crud/core';
import { TypeOrmCacheStrategy } from '@nestjs-crud/typeorm';

const redis = createClient({ url: 'redis://localhost:6379' });
CrudConfigService.load({
  query: { cache: 5000, cacheStrategy: new TypeOrmCacheStrategy(redis) },
});
```

Strategies (`TypeOrm | MikroOrm | Drizzle | PrismaRedis | PrismaAccelerate`) accept `redis` (node-redis v5) or `ioredis` clients with lazy-once auto-connect — no explicit `connect()` required. Custom backends: implement `RedisLike` (`set / get / del / scanPrefix`) from `@nestjs-crud/core/cache`.

Writes auto-invalidate by entity prefix. `?cache=0` per-request bypass. `cacheErrorPolicy: 'fail-fast' | 'fallback-to-source'` knob. `MockCacheStrategy` for tests.

If `@Crud cache` is set but no strategy is wired (and TypeORM has no `DataSource.cache` fallback), the next cached read throws `CrudCacheNotConfiguredError` (plain `Error`, not `HttpException`).

Setup snippets, per-adapter notes, security (auth-persist hashed), production tuning (`allkeys-lru`): [Caching wiki](https://github.com/kodjunkie/nestjs-crud/wiki/Caching).

## Logger

All 4 adapters default to `new Logger(<ServiceName>)` when omitted. TypeORM/Drizzle/MikroORM accept `logger?: LoggerService` as the last positional ctor arg. Prisma's logger lives inside `serviceConfig` as `{ error, warn?, debug? }` (different surface, same default behavior).

## Transactions on write overrides

`updateOne` / `replaceOne` / `deleteOne` wrap their read-modify-write bodies in a transaction at **READ COMMITTED** on all 4 adapters — closes the lost-update race window. Scope: these 3 ops only (`recoverOne` excluded — no prior read).

If you `@Override()` one of these and open your own outer tx, the adapter's inner tx becomes a **savepoint** inside yours. Inner READ COMMITTED is best-effort: a higher outer isolation (SERIALIZABLE) is NOT downgraded. Rollbacks cascade up normally.

## Split-Query Relation Loading (TypeORM only)

```typescript
@Crud({
  model: { type: User },
  query: {
    join: { company: { eager: false }, 'company.projects': { eager: false } },
    relationLoadStrategy: 'query', // default: 'join'
  },
})
```

| Strategy | Behavior | When to pick |
|---|---|---|
| `'join'` | Single SQL via manual `leftJoin` / `innerJoin` | Shallow joins; or you depend on `JoinOption.allow` |
| `'query'` | Separate query per relation via `setFindOptions` | Deep multi-relation reads where JOIN cross-products inflate the payload |

**Footgun:** under `'query'`, `JoinOption.allow` is ignored — relations load all columns. Don't opt in if you use `allow` to hide sensitive columns. Other adapters (Drizzle, MikroORM, Prisma) use split queries natively — opt-in is a no-op.

## Swagger Customization

`@Crud({ swagger: {...} })` controls operation text, tags, examples, error responses, version-aware grouping. Default behavior out of the box: imperative summaries, multi-line descriptions, 400 / 401-if-auth / 404 emission, auto `@ApiTags`, auto request-body examples from `@ApiProperty` metadata.

Key constraints: `operationId` is not overridable; default 401 emission keys off `@CrudAuth` (set `swagger.errorResponses.unauthorized: true` for `APP_GUARD` setups); `synthExample` consumer fn wins over metadata; `@Override()` + manual `@ApiOperation()` wins over `swagger.operations[...]`. Full reference: [Swagger wiki](https://github.com/kodjunkie/nestjs-crud/wiki/Swagger).

## Typed signatures (v2 type tightening)

- **Drizzle:** `protected db: DrizzleClient` (was `any`). Subclass re-declarations conflict — delete and inherit.
- **MikroORM:** 15 `any` sites replaced with `FilterQuery<T>`, `RequiredEntityData<T>`, `EntityMetadata<T>`, `QueryOrderMap<T>`. Untyped callsites need annotations.
- **Core:** `SwaggerEnumType` inlined — no more internal `@nestjs/swagger/dist` imports.

## Best Practices

- Use `CondOperator` enum, not raw operator strings (`'$cont'` silently misspells)
- Use `CrudValidationGroups` constants, not magic strings
- Use `@ParsedBody()` not `@Body()` in write overrides
- Always `exclude` sensitive fields in `query` config (`?fields=password` returns it without)
- Always `allow`-list join fields on sensitive relations
- Use `search` for AND/OR composition; `filter` is AND-only
- Set `maxLimit` server-side — never trust client `limit` alone
- Place `@UseGuards()` on the controller class (runs before `CrudRequestInterceptor`)

## Common Issues

### Runtime / query

- **Relations not loading.** Add to `query.join` in `@Crud()`. Without it, client join requests are silently ignored.
- **`maxLimit` exceeded → 400.** Raise `maxLimit` or set `alwaysPaginate: false`.
- **Validation always fails on update.** Fields need `@IsOptional({ groups: [UPDATE] })`.
- **`@CrudAuth` filter not applying.** Auth guard must run BEFORE `CrudRequestInterceptor`. Place `@UseGuards()` on the class.
- **Flat array instead of `{ data, count, total, page, pageCount }`.** Set `alwaysPaginate: true` inside `query:` (NOT top-level).
- **`RequestQueryException: Invalid field 'X'` → 400.** Strict allowlist. Add to entity columns, whitelist via `@Crud({ query: { allow: [...] } })`, or join the relation. See §Strict Field Allowlist.
- **`RequestQueryException: Invalid persist key 'X'` → 400.** Typo in `@CrudAuth({ persist: {...} })` against entity column.

### Config / install

- **`EBADENGINE` on `npm install`.** Node <22. Upgrade or pin to `^1.0.2`.
- **`CrudCacheNotConfiguredError`.** `@Crud cache` set but no `CacheStrategy` wired (and no TypeORM `DataSource.cache` fallback). See §Caching.
- **`Cannot find module 'typeorm'` / `repo.createQueryBuilder is not a function`.** Adapter peer not installed.
- **Swagger metadata empty / missing.** `@nestjs/swagger` not installed. Library null-guards skip Swagger setup; install + restart.

### Transaction nesting

- **Unexpected SERIALIZABLE inside outer tx, or rollback cascade.** Consumer `@Override()` wrapped in outer tx; adapter adds inner savepoint at READ COMMITTED. Decide: remove the wrap, or accept savepoint nesting.

### Split-query

- **Relation columns under `'query'` include columns NOT in `JoinOption.allow`.** Documented divergence — `setFindOptions` doesn't expose alias-level select control. Stay on `'join'` for sensitive relations.

### Prisma-specific

- **`Unknown argument 'where'` on `include: { rel: { where: ... } }`.** Prisma rejects `where` inside `include` for to-one relations. Filter at parent `where`. Adapter handles SCondition dotted paths on to-one this way automatically.
- **Deep includes feel slow / N+1-looking logs.** Prisma default is query decomposition. Opt into Prisma's `relationJoins` preview on your own `PrismaClient`.
- **`createMany` returns fewer fields than TypeORM equivalent.** Adapter uses `$transaction([create, ...])` array form for full-record parity. If you see v1 behavior, verify v2.

### MikroORM-specific

- **Stale entity across requests / `em.flush()` doesn't persist.** Subclass cached `em` at ctor time. `MikroOrmFetchHelper` takes `getEm: () => EntityManager` thunk — always call `this.getEm()` fresh; never store `em` as a field.
- **Jest ESM error.** Use `yarn test:mikro-orm` — has `NODE_OPTIONS=--experimental-vm-modules` inline. Direct `npx jest` fails.

### Type tightening

- **TS: `Argument of type 'any' is not assignable to parameter of type 'X'`.** MikroORM type tightening. Add explicit annotation (`FilterQuery<T>`, `RequiredEntityData<T>`).
- **TS: `Type 'any' is not assignable to type 'DrizzleClient'`.** Remove `protected db: any` re-declaration; inherit the typed field from the base.
