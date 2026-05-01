---
name: nestjs-crud
description: >-
  Use when integrating `@nestjs-crud/*` (v2.x) into a NestJS project — setting up CRUD controllers, wiring one of the 4 adapters (TypeORM, Drizzle, MikroORM, Prisma — v2.1.0+ requires a Prisma 7 driver adapter), configuring query filters and pagination, scoping requests with `@CrudAuth`, overriding generated endpoints with `@Override()` + `@ParsedRequest()`/`@ParsedBody()`, writing DTOs with `CrudValidationGroups`, customizing Swagger/OpenAPI output via `@Crud({ swagger: {...} })`, opting into TypeORM split-query relation loading (`relationLoadStrategy: 'query'`), or debugging symptoms like `RequestQueryException: Invalid field 'X'` (strict allowlist), `RequestQueryException: Invalid persist key`, `CrudCacheNotConfiguredError`, `EBADENGINE: Unsupported engine` (Node <22), Prisma `Unknown argument 'where'` inside include, `getManyBase returned a flat array`, `validation always fails on update`, `maxLimit exceeded`, MikroORM stale-em identity-map issues, or unexpected savepoint semantics on `@Override()`-wrapped updateOne/replaceOne/deleteOne.
---

# @nestjs-crud

Auto-generates RESTful CRUD endpoints for NestJS controllers from a single `@Crud()` decorator. Four adapters: TypeORM, Drizzle, MikroORM, Prisma. Node 22+.

## What's new in v2

| Area | Change | Since |
|---|---|---|
| New adapter | `@nestjs-crud/prisma` | v2.0.0 |
| Node floor | `engines.node: ">=22.0.0"` on all 7 packages | v2.0.0 |
| peerDependencies | Declared on every package; `@nestjs/common ^10 \|\| ^11` | v2.0.0 |
| Strict field allowlist | Unknown `?sort=`/`?search=`/`?filter=` fields throw `RequestQueryException` (was: silent skip) | v2.0.0 |
| TypeORM split-query | `@Crud({ query: { relationLoadStrategy: 'query' \| 'join' } })` | v2.0.0 |
| Cache fail-fast | `CrudCacheNotConfiguredError` when `@Crud cache` set without provider | v2.0.0 |
| Swagger customization | `@Crud({ swagger: {...} })` — tag/description/examples/operations/errorResponses/synthExample/tagWithVersion | v2.0.0 |
| Optional logger | All 4 adapters default to `new Logger(<ServiceName>)` when omitted | v2.0.0 |
| `@CrudAuth` persist | Runtime validation — typos throw `RequestQueryException` | v2.0.0 |
| Write-path transactions | `updateOne`/`replaceOne`/`deleteOne` wrap at READ COMMITTED | v2.0.0 |
| Drizzle `db` field | `protected db: DrizzleClient` (was `any`) | v2.0.0 |
| MikroORM signatures | `any` → typed generics on public surface | v2.0.0 |
| MikroORM peer cleanup | `@mikro-orm/knex` peer dropped (was install-broken — no stable 7.x on npm; adapter uses `import type` only). Transitive via your driver package. | v2.0.1 |
| Prisma peer narrowed | `@prisma/client` peer: `>=5.0.0` → `^7.0.0`. Driver adapter required; see §Prisma (v7) setup. | v2.1.0 |
| `serviceProperty` | `@Crud({ serviceProperty })` — name the controller field that holds the CrudService (default `'service'`). Enables domain-specific field names without breaking `CrudController<T>`. | v2.2.0 |
| MikroORM repo ctor | `MikroOrmCrudService<T>` constructor now accepts `EntityManager \| EntityRepository<T>` — pass `@InjectRepository` repos directly (MikroORM-only). | v2.2.0 |

## Install

```bash
# Adapters — pick one (or more)
npm install @nestjs-crud/core @nestjs-crud/typeorm
npm install @nestjs-crud/core @nestjs-crud/drizzle
npm install @nestjs-crud/core @nestjs-crud/mikro-orm

# Prisma adapter (v2.1.0+ requires Prisma 7 driver adapter — pick one per dialect):
npm install @nestjs-crud/core @nestjs-crud/prisma @prisma/adapter-pg pg           # Postgres
npm install @nestjs-crud/core @nestjs-crud/prisma @prisma/adapter-mariadb mariadb  # MySQL/MariaDB

# Prisma adapter ALSO needs the Prisma CLI as a devDep:
npm install -D prisma

# Frontend query builder (optional, framework-agnostic):
npm install @nestjs-crud/request
```

**Peers** (declared — `npm install` warns if missing):

- `@nestjs-crud/core`: `class-validator ^0.14.0`, `class-transformer ^0.5.0`, `@nestjs/common ^10.0.0 || ^11.0.0`
- `@nestjs-crud/typeorm`: `typeorm ^0.3`, `@nestjs/typeorm`, `@nestjs-crud/core ^2.0`, `@nestjs/common ^10.0.0 || ^11.0.0`
- `@nestjs-crud/drizzle`: `drizzle-orm >=0.45.2`, `@nestjs-crud/core ^2.0`, `@nestjs/common ^10.0.0 || ^11.0.0`
- `@nestjs-crud/mikro-orm`: `@mikro-orm/core ^7.0.0`, `@nestjs-crud/{core,request,util} ^2.0`, `@nestjs/common ^10.0.0 || ^11.0.0` (note: `@mikro-orm/knex` is NOT a declared peer as of v2.0.1 — consumers receive it transitively via their driver package `@mikro-orm/postgresql`/`@mikro-orm/mysql`/etc.)
- `@nestjs-crud/prisma`: `@prisma/client ^7.0.0` (v2.1.0+), `@nestjs-crud/core ^2.0`, `@nestjs/common ^10.0.0 || ^11.0.0`. Driver adapter (`@prisma/adapter-pg` / `@prisma/adapter-mariadb` / etc.) is NOT a declared peer but is effectively required at runtime — Prisma 7 removed the env-URL path from `PrismaClient` ctor. Pin to `@nestjs-crud/prisma@^2.0.1` + `@prisma/client@^5 || ^6` if you need to stay on pre-v7 Prisma.

**Runtime:** Node 22+ required. `npm install` refuses on older Node (`EBADENGINE`). Swagger is optional — install `@nestjs/swagger` to enable metadata emission; when absent the library null-guards every Swagger path.

## Quickstart

Controller + `@Crud()` decorator are identical across adapters. Only the service's base class and DI wiring change.

### Controller (all adapters)

```typescript
// user.controller.ts
@Crud({
  model: { type: User },
  query: {
    limit: 25,
    maxLimit: 100,
    join: {
      profile: { eager: true },     // auto-join relation
      posts: { allow: ['id', 'title'] }, // allowed fields only
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
import { TypeOrmCrudService } from '@nestjs-crud/typeorm';

@Injectable()
export class UsersService extends TypeOrmCrudService<User> {
  constructor(@InjectRepository(User) repo: Repository<User>) {
    super(repo);
  }
}
```

### Drizzle service

```typescript
import { DrizzleCrudService } from '@nestjs-crud/drizzle';
import { users } from './schema';
import type { db } from './db';

@Injectable()
export class UsersService extends DrizzleCrudService<typeof users.$inferSelect> {
  constructor(@Inject('DB') drizzleDb: typeof db) {
    super(drizzleDb, users);  // (db instance, table reference)
  }
}
```

### MikroORM service

```typescript
import { MikroOrmCrudService } from '@nestjs-crud/mikro-orm';
import { EntityManager } from '@mikro-orm/core';

@Injectable()
export class UsersService extends MikroOrmCrudService<User> {
  constructor(em: EntityManager) {
    super(em, User);
  }
}
```

`MikroOrmCrudService` accepts `EntityManager` directly — pass it as the first ctor arg and the entity class as the second. The `MikroOrmModule` middleware forks a per-request em into AsyncLocalStorage; the DI-injected em proxy resolves to that forked em on every call, so request-scope identity-map isolation is preserved without extra effort.

If you prefer `@InjectRepository(User)` style, pass the repository directly — no manual unwrapping needed:

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

The constructor accepts `EntityManager | EntityRepository<T>`. When a repository is passed, the library unwraps it via `repo.getEntityManager()` internally — the resulting em is the same ALS-backed proxy, so request-scope identity-map isolation is preserved.

> **MikroORM-only:** This constructor union is specific to the MikroORM adapter. TypeORM/Drizzle/Prisma adapter constructors retain their respective `Repository<T>` / `DrizzleClient` / `PrismaClient` signatures unchanged.

### Prisma service

```typescript
// On v2.1.0+ with Prisma 7: build PrismaClient with a driver adapter (env-URL path is gone).
// On v2.0.x with Prisma 5/6: use `new PrismaClient()` — env-URL path still works.
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

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

Prisma's 3rd arg is a `PrismaCrudServiceConfig` object (logger lives inside it, not as a separate ctor arg). On v2.1.0+, Prisma 7 also requires stripping `datasource.url` from `schema.prisma` and creating a `prisma.config.ts` for Migrate — see [v2.1 Migration wiki](https://github.com/kodjunkie/nestjs-crud/wiki/v2.1-Migration) for the complete walkthrough (schema rewrite, config file, search_path landmine, MariaDB session-scope landmine). Swap `@prisma/adapter-pg` + `pg` for `@prisma/adapter-mariadb` + `mariadb` on MySQL.

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

Set project-wide defaults once, before Nest bootstraps. Every `@Crud()` inherits these and can override per-controller.

```typescript
// src/main.ts — BEFORE the app is created
import { CrudConfigService } from '@nestjs-crud/core';

CrudConfigService.load({
  query: {
    limit: 25,
    maxLimit: 100,
    alwaysPaginate: true,
    cache: 2000,
    softDelete: false,
  },
  routes: {
    updateOneBase: { allowParamsOverride: false, returnShallow: false },
    deleteOneBase: { returnDeleted: false },
  },
  params: {
    id: { field: 'id', type: 'number', primary: true },
  },
  serialize: { getMany: false },   // disable serialize globally for list responses
  queryParser: { delimiter: ',' }, // passed to RequestQueryBuilder.setOptions
  auth: { property: 'user' },      // default user property for @CrudAuth
});

const app = await NestFactory.create(AppModule);
```

Call `load()` **at module load time** (top of `main.ts`, before `NestFactory.create`). Deep-merges into `CrudConfigService.config`. Per-controller `@Crud()` options merge on top — controller values win for scalar keys; arrays are replaced, not concatenated.

Default behavior without `load()`: `alwaysPaginate: false`, no global params, no auth defaults, no route-level return flags set.

## Query Params (Frontend → Backend)

Use `RequestQueryBuilder` on the frontend to build type-safe query strings:

```typescript
import { RequestQueryBuilder, CondOperator } from '@nestjs-crud/request';

const qb = RequestQueryBuilder.create()
  .setFilter({ field: 'isActive', operator: CondOperator.EQUALS, value: true })
  .setOr({ field: 'role', operator: CondOperator.IN, value: ['admin', 'mod'] })
  .setJoin({ field: 'profile' })
  .sortBy({ field: 'createdAt', order: 'DESC' })
  .setLimit(20)
  .setPage(2);

fetch(`/users?${qb.query()}`);
```

**Supported operators** (23 total — `CondOperator` enum):

- Equality: `$eq`, `$ne`
- Comparison: `$gt`, `$gte`, `$lt`, `$lte`
- Range: `$between` (value = `[min, max]`)
- Null checks: `$isnull`, `$notnull`
- Set membership: `$in`, `$notin`
- String match: `$cont`, `$excl`, `$starts`, `$ends`
- Case-insensitive: `$eqL`, `$neL`, `$inL`, `$notinL`, `$contL`, `$exclL`, `$startsL`, `$endsL`

**Raw params:** `?filter=name||$cont||john&sort=createdAt,DESC&limit=25&page=2&join=profile`

## `@Crud()` Key Options

```typescript
@Crud({
  model: { type: Entity },          // required

  dto: {                            // optional — dedicated DTO classes (see §DTOs)
    create: CreateEntityDto,
    update: UpdateEntityDto,
    replace: ReplaceEntityDto,
  },

  serialize: {                      // optional — per-route response DTOs (class-transformer)
    getMany: EntityListResponse,    //   or `false` to disable serialization on a route
    get: EntityResponse,
    create: EntityResponse,
  },

  query: {
    limit: 25,                       // default page size
    maxLimit: 100,                   // hard cap
    cache: 2000,                     // ms — honored by all 4 adapters when a CacheStrategy is wired; throws CrudCacheNotConfiguredError if set without one
    alwaysPaginate: false,           // force pagination
    softDelete: false,               // enables recoverOneBase + hides soft-deleted rows from reads
    relationLoadStrategy: 'join',    // TypeORM only — 'join' (default) or 'query'. See §Split-Query
    join: {
      relation: {
        eager: true,
        allow: ['id', 'name'],       // whitelist
        exclude: ['secret'],         // blacklist
        required: false,             // LEFT vs INNER JOIN
      },
    },
    filter: [{ field: 'deletedAt', operator: '$isnull' }], // always-on filter
    sort: [{ field: 'id', order: 'ASC' }],                 // default sort
    exclude: ['password'],                                  // never return these fields
  },

  routes: {
    exclude: ['createManyBase', 'recoverOneBase'],
    getManyBase:   { decorators: [UseGuards(AuthGuard)] },
    createOneBase: { returnShallow: false },
    updateOneBase: { allowParamsOverride: false, returnShallow: false },
    replaceOneBase:{ allowParamsOverride: false, returnShallow: false },
    deleteOneBase: { returnDeleted: false },
    recoverOneBase:{ returnRecovered: false },
  },

  params: {
    id: { field: 'id', type: 'uuid', primary: true },
  },

  swagger: {                        // optional — see §Swagger Customization
    tag: 'Users',
    operations: { getManyBase: { summary: 'List users' } },
    // ...tagWithVersion, description, examples, errorResponses, synthExample
  },

  validation: { whitelist: true },  // optional — ValidationPipeOptions, or `false` to disable
  serviceProperty: 'usersService', // optional — controller field that holds the CrudService (default: 'service')
  routesFactory: MyCustomFactory,   // optional — subclass of CrudRoutesFactory for advanced cases
})
```

`recoverOneBase` requires `query.softDelete: true` (in decorator OR global config) AND a soft-delete column on the entity.

## Scoping Requests Per User (`@CrudAuth`)

```typescript
@Crud({ model: { type: Post } })
@CrudAuth({
  property: 'user',
  filter: (user: User) => ({ authorId: { $eq: user.id } }),
  persist: (user: User) => ({ authorId: user.id }),  // auto-set on create/update
  or: false,
})
@UseGuards(JwtAuthGuard)
@Controller('posts')
export class PostsController implements CrudController<Post> {
  constructor(public service: PostsService) {}
}
```

- `filter` — appended to every GET query (users can't see other users' data)
- `persist` — appended to every write (prevents spoofing `authorId`)
- `property` — where to find the user on `req` (default: `'user'`)

**Runtime persist validation.** `RequestQueryParser` validates each `persist` key against the entity's `entityColumnsHash` at runtime. Unknown keys throw `RequestQueryException` (mapped to `400 Bad Request` by `CrudRequestInterceptor`):

```
RequestQueryException: Invalid persist key 'user_id' — not in entityColumnsHash
```

Audit every `@CrudAuth({ persist: {...} })` against your entity column names — typos fail fast.

**Guard ordering:** `@UseGuards()` must come BEFORE `@CrudAuth()` can read `req.user`. Place the auth guard on the controller class (not individual routes) so it runs before `CrudRequestInterceptor` resolves `property` from `req`.

## Overriding Generated Routes (`@Override`)

```typescript
@Crud({ model: { type: User } })
@Controller('users')
export class UsersController implements CrudController<User> {
  constructor(public service: UsersService) {}

  // Override a read route
  @Override('getOneBase')
  @UseInterceptors(MyInterceptor)
  getUser(@ParsedRequest() req: CrudRequest, @Param('id') id: string) {
    return this.service.getOne(req); // delegate parsed request to service
  }

  // Override a write route — use @ParsedBody(), NOT @Body()
  @Override('createOneBase')
  createUser(
    @ParsedRequest() req: CrudRequest,
    @ParsedBody() dto: User,          // carries validation groups; @Body() does not
  ) {
    return this.service.createOne(req, dto);
  }
}
```

`@Override` accepts: `'getManyBase'`, `'getOneBase'`, `'createOneBase'`, `'createManyBase'`, `'updateOneBase'`, `'replaceOneBase'`, `'deleteOneBase'`, `'recoverOneBase'`.

Use `@ParsedBody()` not `@Body()` in write overrides — `@Body()` bypasses `class-validator` group selection (CREATE and UPDATE validation become identical).

## IntelliSense — TypeScript errors on generated handlers

`@Crud()` wires the route handlers onto your controller at runtime. TypeScript can't see them. Two consequences.

The injected `CrudService` is untyped unless the controller declares `implements CrudController<T>`. The interface restores the type.

Calling a base method like `this.getManyBase(req)` fails typecheck. The methods are declared optional on the `CrudController<T>` interface, and the class type doesn't include them. Workaround is a `base` getter that returns `this` cast to the interface:

```typescript
import { Crud, CrudController } from '@nestjs-crud/core';

@Crud({ model: { type: User } })
@Controller('users')
export class UsersController implements CrudController<User> {
  constructor(public service: UsersService) {}

  get base(): CrudController<User> {
    return this;
  }
}
```

A TypeScript class-decorator limit, not specific to `@nestjs-crud`. Decorators mutate runtime behavior but can't extend the class type.

**Most code shouldn't need `base`.** Calling `this.service.getMany(req)` / `this.service.getOne(req)` from inside an `@Override()` is fully typed and idiomatic — the override examples above use that pattern. Reach for the `base` getter only when you specifically want to invoke a generated handler (e.g., to compose two base routes inside one override).

## DTOs — Two Supported Patterns

**Pattern A: Entity-as-DTO (easy path, default).** `class-validator` groups on the entity — one class serves as persistence model AND input validation shape.

```typescript
import { CrudValidationGroups } from '@nestjs-crud/core';
const { CREATE, UPDATE } = CrudValidationGroups;

@Entity()
export class User {
  @IsOptional({ groups: [UPDATE] })
  @IsNotEmpty({ groups: [CREATE] })
  @IsString({ always: true })
  @Column()
  name: string;

  @IsOptional({ always: true })
  @IsEmail({ always: true })
  @Column({ nullable: true })
  email: string;
}
```

- `CREATE` group runs on `POST /users` and `PUT /users/:id`
- `UPDATE` group runs on `PATCH /users/:id`
- `{ always: true }` runs on both

**Pattern B: Dedicated DTO classes** via `@Crud({ dto: { create, update, replace } })`. Use when the write shape differs meaningfully from the entity:

```typescript
export class CreateUserDto {
  @IsNotEmpty() @IsString() name: string;
  @IsEmail() email: string;
  // no `id`, no `deletedAt`, no `password`
}

@Crud({
  model: { type: User },
  dto: { create: CreateUserDto, update: UpdateUserDto, replace: CreateUserDto },
})
@Controller('users')
export class UsersController implements CrudController<User> { ... }
```

With `dto`, the controller validates the body against the DTO class — `CrudValidationGroups` is NOT used. Use Pattern B when strict API boundary matters; Pattern A when the entity is already a clean input shape.

**Output serialization is separate:** `serialize: { getMany, get, create, ... }` transforms responses through a DTO with `class-transformer`. Combine Pattern A entity-in + `serialize` DTO out freely.

### Validation groups: factory vs hand-rolled controllers

`CrudValidationGroups.CREATE` / `UPDATE` only fire when the validator runs with matching `groups`. The `@Crud()` factory wires this automatically — every generated route binds a `new ValidationPipe({ groups: [CREATE | UPDATE], ... })` per route.

Hand-rolled controllers built without `@Crud()` get the **default** `ValidationPipe` (or your global one), where `groups: undefined`. Group-scoped decorators silently skip — required-field validators on entity fields don't fire.

```typescript
// ✗ Hand-rolled — group-scoped decorators silently skip
@Controller('special')
export class SpecialController {
  @Post('/users')
  createSpecial(@Body() user: User) { ... }  // CREATE-group validators DO NOT run
}

// ✓ Hand-rolled — wire the group pipe explicitly
import { ValidationPipe } from '@nestjs/common';
import { CrudValidationGroups } from '@nestjs-crud/core';

@Controller('special')
export class SpecialController {
  @Post('/users')
  createSpecial(
    @Body(new ValidationPipe({ groups: [CrudValidationGroups.CREATE], whitelist: true }))
    user: User,
  ) { ... }
}
```

Swap to `CrudValidationGroups.UPDATE` for `PATCH`-style. Many such routes? Factor a helper. Alternative: switch to dedicated DTOs (Pattern B above) without group decorators — they validate identically everywhere without the group plumbing.

## Strict Field Allowlist

Every field passed through `?sort=`, `?filter=`, `?search=`, `?fields=`, or `?join=` MUST be either:

1. A column in `entityColumnsHash` (real entity column), OR
2. A relation explicitly listed in `@Crud({ query: { join: { ... } } })` — in which case dotted paths like `profile.name` work.

Otherwise:

```
RequestQueryException: Invalid field 'foo' for entity 'User'
```

Mapped to `400 Bad Request` by `CrudRequestInterceptor`. No opt-out — allowlist is the sole validation path in v2.

**Common breakages:**
- TypeORM `@VirtualColumn` / `@Formula` fields — not in `entityColumnsHash` by default; whitelist via `@Crud({ query: { allow: [...] } })`.
- Client-side aliases for joined-subquery results.
- Dotted paths like `profile.name` when `profile` isn't in the controller's `join=` allowlist.

## Swagger Customization

`@Crud({ swagger: {...} })` controls every knob Swagger UI reads — operation text, tags, example payloads, error response emission, version-aware grouping. Every path is null-guarded; consumers without `@nestjs/swagger` installed are unaffected.

```typescript
@Crud({
  model: { type: User },
  swagger: {
    tag: 'Users',                              // default: pluralized entity name; skipped if @ApiTags is on the class
    tagWithVersion: true,                      // default: false — prepends `v{n}/` via VERSION_METADATA
    description: 'Full user CRUD surface.',    // controller-level Swagger description
    examples: true,                            // default: true — auto-synth request body examples from @ApiProperty
    synthExample: (entity, route) => ({ ... }),// optional consumer fn; wins over @ApiProperty introspection
    errorResponses: {
      unauthorized: true,                      // force-emit 401 even without @CrudAuth (see §Global guards)
    },
    operations: {
      getManyBase: { summary: 'List users', description: 'Supports ?filter=, ?s=, ?sort=, ?join=' },
      deleteOneBase: { deprecated: true, summary: 'Delete user (deprecated — use DELETE /users/:id/archive)' },
      // Any subset of the 8 base routes. Full ApiOperationOptions surface EXCEPT operationId.
    },
  },
})
@Controller('users')
export class UsersController {}
```

Default behavior out of the box (no override needed): imperative operation summaries, multi-line route descriptions, outcome-focused response text, 400/401-if-auth/404 error emission, auto `@ApiTags` from pluralized entity name, auto request-body examples from `@ApiProperty` metadata (`{}` fallback).

### Key constraints + footguns

**`operationId` is not overridable.** `swagger.operations[...]` accepts `Omit<ApiOperationOptions, 'operationId'>`. Auto-generated IDs (`getManyUserBase`, etc.) are unique per controller+route; OpenAPI requires document-wide uniqueness.

**Global guards and 401 emission.** Default 401 auto-emission keys off `@CrudAuth()` on the controller class. If you protect routes via `APP_GUARD` (globally-registered `AuthGuard`), the adapter can't detect it — set `swagger.errorResponses.unauthorized: true` to force-emit 401.

**`synthExample` dispatch order (1 → 2 → 3).** Consumer fn wins → `@ApiProperty` metadata → `{}`. Whatever the fn returns ships verbatim in OpenAPI JSON — do not leak secrets.

**`tagWithVersion` under `app.enableVersioning()`.** Default tag (`Users`) collides across API versions. Set `tagWithVersion: true` to prepend `v{n}/` using NestJS's `VERSION_METADATA` reflection key, or override `tag` explicitly.

**`@Override()` + `@ApiOperation()` wins.** Manually decorating an overridden route with `@ApiOperation({...})` takes precedence over the `swagger.operations[...]` entry — factory merges overridden metadata on top of defaults.

## Split-Query Relation Loading (TypeORM only)

Opt into TypeORM's native split-query strategy for deep multi-relation reads:

```typescript
@Crud({
  model: { type: User },
  query: {
    join: { company: { eager: false }, 'company.projects': { eager: false } },
    relationLoadStrategy: 'query',  // default: 'join'
  },
})
```

| Strategy | Behavior | When to pick |
|---|---|---|
| `'join'` (default) | Manual `leftJoin`/`innerJoin` via `JoinResolver`. Single SQL query. | Shallow joins, small fan-out, OR you depend on `JoinOption.allow` to constrain relation columns. |
| `'query'` | TypeORM emits separate queries per relation via `setFindOptions({ relationLoadStrategy: 'query' })`. | Deep multi-relation reads where a single JOIN multiplies parent rows by cross-product of child counts. Trades 1+N round-trips for linear-row payload. |

**N+1 isn't always worse than one big JOIN** — when relations fan out (1→many→many), the JOIN inflates bytes-on-the-wire and hurts pagination. Pick by query shape, not by reflex.

### ⚠ Footgun: `JoinOption.allow` is ignored under `'query'`

Under `'join'`, `JoinOption.allow: ['name', 'domain']` constrains which relation columns are returned. Under `'query'`, TypeORM's `setFindOptions({ relations: { company: true } })` loads **all columns** regardless. If you use `allow` to hide sensitive relation columns from API responses, do NOT opt into `'query'` strategy on those controllers, or audit every relation explicitly.

**Other adapters** (Drizzle, MikroORM, Prisma) use split queries natively — this opt-in is TypeORM-only and a no-op elsewhere.

## Caching

`@nestjs-crud` ships a `CacheStrategy` interface in `@nestjs-crud/core/cache` and per-adapter implementations for all four ORMs. `@Crud({ query: { cache: <ttl-ms> } })` is honored end-to-end when a strategy is wired. All `ttl` arguments are MILLISECONDS uniformly across the contract.

### Setup pattern

Wire a strategy globally via `CrudConfigService.load`. Strategies accept both `redis` (node-redis v5) and `ioredis` clients — auto-detection chooses the adapter; no explicit `connect()` needed (lazy-once auto-connect on first cache op).

```ts
// Option A — node-redis (v5)
import { createClient } from 'redis';
import { CrudConfigService } from '@nestjs-crud/core';
import { TypeOrmCacheStrategy } from '@nestjs-crud/typeorm';

const redis = createClient({ url: 'redis://localhost:6379' });
CrudConfigService.load({
  query: { cache: 5000, cacheStrategy: new TypeOrmCacheStrategy(redis) },
});

// Option B — ioredis
import Redis from 'ioredis';
const redis = new Redis({ host: 'localhost', port: 6379 });
CrudConfigService.load({
  query: { cache: 5000, cacheStrategy: new TypeOrmCacheStrategy(redis) },
});
```

Per-service override is also supported: pass the strategy as the optional last constructor argument when extending the CrudService class.

Custom backends are supported by implementing the `RedisLike` interface (`set`, `get`, `del`, `scanPrefix`) from `@nestjs-crud/core/cache` and passing it directly to any strategy constructor.

### Per-adapter strategies

| Adapter | Strategy class | Backend |
|---|---|---|
| TypeORM | `TypeOrmCacheStrategy` | BYO Redis |
| MikroORM | `MikroOrmCacheStrategy` | BYO Redis (bypasses MikroORM Result Cache) |
| Drizzle | `DrizzleCacheStrategy` | BYO Redis (config-object ctor) |
| Prisma | `PrismaRedisCacheStrategy` | BYO Redis |
| Prisma | `PrismaAccelerateCacheStrategy` | Prisma Accelerate gateway |

### Auto-invalidation

Every write method (`createOne`, `createMany`, `updateOne`, `replaceOne`, `deleteOne`, `recoverOne`) calls `cacheStrategy.invalidate('<entityName>:')` after a successful commit. Consumers do not need to manually evict. TTL acts as a safety net for any out-of-band invalidation.

### Per-request opt-out

`GET /users?cache=0` bypasses the cache for that request only — the cached entry is not invalidated, the TTL keeps running. Recognized values: `0`, `1`, `true`, `false`. Unrecognized values silent-ignore (treated as if absent).

### Production knobs

- **`cacheErrorPolicy: 'fail-fast' | 'fallback-to-source'`** — controls behavior on cache backend errors. Default `'fail-fast'`; opt into `'fallback-to-source'` for graceful degradation when Redis/Accelerate is down.
- **Redis `maxmemory-policy allkeys-lru`** — recommended for Redis-backed strategies; cache key cardinality is unbounded due to full request fingerprinting.
- **Single-flight** — all shipped strategies de-dup concurrent cold-cache requests for the same key (only one DB fetch under stampede).

### Security

`authPersist` is included in the cache-key fingerprint via SHA-1 hash — multi-tenant isolation preserved AND plaintext auth context never appears in cache keys (mitigates PII leakage and timing attacks via cache-key inspection).

### `CrudCacheNotConfiguredError`

If `@Crud({ query: { cache } })` is set but no `CacheStrategy` is wired (and, for TypeORM, no `DataSource.cache` fallback either), the next cached read throws:

```
CrudCacheNotConfiguredError: @Crud cache option requires a CacheStrategy. Configure via
CrudConfigService.load({ query: { cacheStrategy } }) or pass a strategy to the CrudService
constructor. For TypeORM, the legacy DataSource.cache provider is also accepted as a fallback.
```

### Mock strategy for tests

`MockCacheStrategy` (a `Map`-backed in-memory implementation with single-flight de-dup) ships from `@nestjs-crud/core` for use in test fixtures.

### See also

Full setup details, decision criteria for Prisma backends, and custom-strategy implementation guide: [Caching wiki page](https://github.com/kodjunkie/nestjs-crud/wiki/Caching).

## Cache Fail-Fast

If `@Crud({ query: { cache } })` is set but no `CacheStrategy` is wired (and, for TypeORM, no `DataSource.cache` fallback either), the next cached read throws:

```
CrudCacheNotConfiguredError: @Crud cache option requires a CacheStrategy. Configure via
CrudConfigService.load({ query: { cacheStrategy } }) or pass a strategy to the CrudService
constructor. For TypeORM, the legacy DataSource.cache provider is also accepted as a fallback.
```

Exported from `@nestjs-crud/core` as a plain `Error` subclass (NOT `HttpException`):

```typescript
import { CrudCacheNotConfiguredError } from '@nestjs-crud/core';
```

**Fix:** wire a `CacheStrategy` via `CrudConfigService.load({ query: { cacheStrategy } })` or pass it to the CrudService constructor. For TypeORM, `DataSource({ cache: { type: 'redis' | 'database' | true, ... } })` is also accepted as a legacy fallback. OR remove `cache` from `@Crud()`.

**Adapter coverage:** all four adapters via the unified `CacheStrategy` interface. See §Caching.

## Optional Logger

All 4 adapters accept a logger and default to `new Logger(<ServiceName>)` when omitted. Surface differs for Prisma.

### TypeORM, Drizzle, MikroORM

`logger?: LoggerService` as the last positional ctor argument:

```typescript
@Injectable()
export class UsersService extends TypeOrmCrudService<User> {
  constructor(
    @InjectRepository(User) repo: Repository<User>,
    @Inject(Logger) logger: LoggerService,   // optional
  ) {
    super(repo, logger);                      // pass-through; defaults to new Logger if omitted
  }
}
```

### Prisma (different surface, same default behavior)

Logger lives inside `serviceConfig` as a structural shape `{ error, warn?, debug? }` — NOT a separate ctor arg. Default when omitted: ctor auto-instantiates `new Logger(PrismaCrudService.name)` — same as the other 3 adapters.

```typescript
constructor(prisma: PrismaClient) {
  super(prisma, 'user', {
    entityColumns: [...],
    primaryColumns: [...],
    softDeleteColumn: 'deletedAt',
    // Omit to get `new Logger(PrismaCrudService.name)`. Override only when you need non-default sinks:
    // logger: new Logger('UsersService'),
  });
}
```

**Remaining asymmetry:** surface only. Moving Prisma to a separate ctor parameter is a breaking change deferred to v3.

### Emission policy (all adapters)

- `debug` — query-build tracing (off by default in production NestJS logger config)
- `warn` — SQLi rejections, transaction rollbacks
- `error` — uncaught DB errors; message uses `err.name` (never `err.message` — DB drivers leak SQL parameters there); stack passed as second arg per `LoggerService` signature

## Transaction Semantics (Write Overrides)

`updateOne`, `replaceOne`, `deleteOne` on all 4 adapters wrap their read-modify-write bodies in a transaction at **READ COMMITTED**. Closes the lost-update race window.

**Scope:** these 3 ops ONLY. `recoverOne` is EXCLUDED (plain `update({ deletedAt: null })` — no prior read, no race). No retry. No consumer config knob.

| Adapter | Transaction primitive |
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
    const user = await super.updateOne(req, dto);  // inner = savepoint
    await this.auditLog.record(user, manager);
    return user;
  });
}
```

- Inner READ COMMITTED is best-effort: if your outer tx set a higher isolation (SERIALIZABLE, REPEATABLE READ), the inner call does NOT downgrade it.
- Savepoint semantics apply on TypeORM, Drizzle, MikroORM v7, and Prisma.
- Rollbacks cascade up normally.

If you don't want nesting, call the adapter's read/write primitives directly instead of `super.updateOne(...)`.

## Typed Signatures

- **Drizzle:** `protected db: DrizzleClient` (was `any`). Subclasses that re-declared `protected db: any` get a conflict — delete the re-declaration and inherit the typed field.
- **MikroORM:** 15 `any` sites on public method signatures replaced with typed generics (`FilterQuery<T>`, `RequiredEntityData<T>`, `EntityMetadata<T>`, `QueryOrderMap<T>`). Callsites passing untyped values may need explicit annotations.
- **Core:** `SwaggerEnumType` inlined — no more internal `@nestjs/swagger/dist/types/swagger-enum.type` import. If you imported it, inline locally: `string[] | number[] | (string | number)[] | Record<number, string>`.

## Best Practices

**Use `CondOperator` enum — never raw operator strings.** `'$cont'` silently misspells; `CondOperator.CONTAINS` is caught by TypeScript.

**Use `CrudValidationGroups` constants — never magic strings.** `['update']` is NOT equal to `CrudValidationGroups.UPDATE`.

**Use `@ParsedBody()` not `@Body()` in write overrides.** `@Body()` bypasses `class-validator` group selection — CREATE and UPDATE validation become identical.

**Always `exclude` sensitive fields in `query` config.** Without it, a client can request `?fields=password` and get it.

**Always `allow`-list join fields on sensitive relations.** Without `allow`, a joined relation returns all its columns.

**Use `search` for complex AND/OR — `filter` is AND-only.**
```typescript
RequestQueryBuilder.create().search({
  $or: [
    { name: { $contL: 'alice' } },
    { email: { $contL: 'alice' } },
  ],
});
// Raw: ?s={"$or":[{"name":{"$contL":"alice"}},{"email":{"$contL":"alice"}}]}
```

**Set `maxLimit` server-side — never trust client `limit` alone.** A client that omits `limit` or sends a huge value gets all rows without `maxLimit`.

**`@UseGuards()` must come before `@CrudAuth()` can read `req.user`.** Place auth guard on the controller class (not individual routes) so it runs before `CrudRequestInterceptor` resolves `property` from `req`.

## Common Issues

### Runtime / query behavior

**Relations not loading.** Add the relation to `query.join` in `@Crud()`. Without it, client join requests are silently ignored.

**`maxLimit` exceeded → 400.** Client sent `limit` above `maxLimit`. Raise `maxLimit` or set `alwaysPaginate: false`.

**Validation always fails on update.** Fields need `@IsOptional({ groups: [UPDATE] })` — without it, UPDATE validation is as strict as CREATE.

**`@CrudAuth` filter not applying.** Auth guard must run BEFORE `CrudRequestInterceptor` and populate `req.user` (or your configured `property`). Place `@UseGuards(...)` on the controller class.

**Empty response / flat array instead of `{ data, count, total, page, pageCount }`.** `getManyBase` returns a flat array by default. Set `alwaysPaginate: true` inside the `query:` block in `@Crud()` (NOT top-level):
```typescript
@Crud({ model: { type: User }, query: { alwaysPaginate: true } })
```

**`RequestQueryException: Invalid field 'X'` → 400.** Strict allowlist rejects unknown sort/filter/search fields. Add the field to entity columns, whitelist via `@Crud({ query: { allow: [...] } })`, or join the relation via `?join=` + register it in `@Crud({ query: { join: {...} } })`. See §Strict Field Allowlist.

**`RequestQueryException: Invalid persist key 'X'` → 400.** Typo in `@CrudAuth({ persist: {...} })`. Fix the key to match the entity column exactly.

### Config / install

**`EBADENGINE: Unsupported engine` on `npm install`.** Node <22. Upgrade to Node 22+, or pin to `^1.0.2` (see §Still on v1.0.x).

**`CrudCacheNotConfiguredError` on first cached read.** `@Crud({ query: { cache } })` set but `DataSource({ cache: ... })` not configured. Configure the cache provider OR remove `cache` from `@Crud()`. See §Cache Fail-Fast.

**`@Crud({ query: { cache } })` silently does nothing on Drizzle/MikroORM/Prisma.** Only TypeORM honors it. Use the ORM's native caching at the application layer.

**`TypeError: repo.createQueryBuilder is not a function` / `Cannot find module 'typeorm'`.** TypeORM peer not installed. Run `yarn add typeorm @nestjs/typeorm @nestjs/common` (or the equivalent for your adapter). v2 declares peers — `npm install` warns if missing.

**Swagger routes documented but metadata empty / missing.** `@nestjs/swagger` not installed. Null-guard skips Swagger setup when absent. Install `@nestjs/swagger` and restart.

### Transaction nesting

**Unexpected SERIALIZABLE isolation inside your outer tx, or rollback cascading unexpectedly.** Consumer `@Override()` wraps `updateOne`/`replaceOne`/`deleteOne` in an outer transaction; adapter adds an inner savepoint at READ COMMITTED. Decide intent: remove the outer wrap, or accept savepoint nesting. See §Transaction Semantics.

### Split-query footgun

**Relation columns under `'query'` strategy include columns NOT in `JoinOption.allow`.** Documented divergence — `setFindOptions` doesn't expose alias-level select control. Either keep `'join'` strategy on those controllers, or audit every relation explicitly.

### Prisma-specific

**`Unknown argument 'where'` on `include: { company: { where: {...} } }`.** Prisma rejects `where` inside `include` for to-one relations. Filter at parent `where`: `{ where: { company: { ... } } }`. Adapter handles SCondition dotted paths on to-one this way automatically. Filtered `include` works only for to-many.

**Deep includes feel slow / emit N+1-looking query logs.** Prisma default is query decomposition, not SQL JOIN (1 + N_depth queries). Opt into Prisma's `relationJoins` preview feature on your own `PrismaClient` (adapter inherits transparently). Not forced.

**`createMany` returns fewer fields than TypeORM equivalent / missing DB-assigned ids.** Prisma native `createMany` returns `{ count }` only; adapter uses `$transaction([create, ...])` array form for full-record parity. If you see v1 behavior, verify you're on v2.


### MikroORM-specific

**Stale entity returned across requests, or `em.flush()` doesn't persist.** Subclass cached `em` at constructor time, breaking per-request identity-map isolation. `MikroOrmFetchHelper` takes `getEm: () => EntityManager` thunk — always call `this.getEm()` fresh inside every method; never store `em` as a field.

**Jest ESM error: `SyntaxError: Unexpected token 'export'` / `import.meta outside a module`.** Running MikroORM specs without the ESM preset. Use `yarn test:mikro-orm` (has `NODE_OPTIONS=--experimental-vm-modules` inline) — NOT `npx jest` directly.

### Type tightening

**TS: `Argument of type 'any' is not assignable to parameter of type 'X'`.** MikroORM type tightening. Add explicit annotation (`FilterQuery<T>`, `RequiredEntityData<T>`, `EntityMetadata<T>`, `QueryOrderMap<T>`); most fixes one-line.

**TS: `Type 'any' is not assignable to type 'DrizzleClient'` on Drizzle subclass field.** Remove the `protected db: any` re-declaration; inherit the typed field from the base.

