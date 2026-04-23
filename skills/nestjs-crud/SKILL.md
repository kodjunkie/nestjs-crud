---
name: nestjs-crud
description: Use when integrating @nestjs-crud v1.0.x into a NestJS project — setting up CRUD controllers, configuring query filters and pagination, scoping requests with @CrudAuth, overriding generated endpoints, troubleshooting relations, validation, Swagger, debugging symptoms like `getManyBase returned a flat array`, `@CrudAuth filter not applying` (or filter applies wrong rows due to silently-ignored persist-key typos), `validation always fails on update`, `maxLimit exceeded`, `repo.createQueryBuilder is not a function` after installing the adapter package, MikroORM stale entity returned across requests, `@Crud({ query: { cache } })` silently doing nothing on Drizzle/MikroORM. Use the `nestjs-crud-v2` skill for v2.x; use the `nestjs-crud-migration` skill to upgrade from v1 to v2.
---

# @nestjs-crud

Auto-generates RESTful CRUD endpoints for NestJS controllers from a single `@Crud()` decorator. Supports TypeORM, Drizzle, and MikroORM.

## Install

```bash
# Pick your ORM adapter:
npm install @nestjs-crud/core @nestjs-crud/typeorm
npm install @nestjs-crud/core @nestjs-crud/drizzle
npm install @nestjs-crud/core @nestjs-crud/mikro-orm

# Frontend query builder (optional, framework-agnostic):
npm install @nestjs-crud/request
```

**Peer deps (required, install explicitly):**
- `@nestjs-crud/core` peers: `class-validator`, `class-transformer`
- `@nestjs-crud/typeorm` ALSO needs: `typeorm`, `@nestjs/typeorm`, `@nestjs/common`
- `@nestjs-crud/drizzle` ALSO needs: `drizzle-orm` (≥ 0.36.0), `@nestjs/common`
- `@nestjs-crud/mikro-orm` ALSO needs: `@mikro-orm/core` (≥ 6.0.0), `@mikro-orm/knex` (≥ 6.0.0), `@nestjs/common`

**Heads-up (v1.0.2):** `@nestjs-crud/typeorm`'s `package.json` does NOT declare these as peerDependencies, so `npm install` will NOT warn you if you forget them. If you see `TypeError: repo.createQueryBuilder is not a function` at runtime or `Cannot find module 'typeorm'`, install the peers explicitly. Fixed in v2 (every adapter declares full peers).

Swagger is optional — install `@nestjs/swagger` and decoration auto-generates. If `@nestjs/swagger` is absent, the library silently skips Swagger setup (via internal `safeRequire`).

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

// ...then createApp as usual
const app = await NestFactory.create(AppModule);
```

Call `load()` **at module load time** (top of `main.ts`, before `NestFactory.create`). Deep-merges into `CrudConfigService.config`. Per-controller `@Crud()` options merge on top — controller values win for scalar keys; arrays are replaced, not concatenated.

**Default behavior without `load()`:** `alwaysPaginate: false`, no global params, no auth defaults, no route-level return flags set. Every controller must set its own options.

## Quickstart

The controller + `@Crud()` decorator are identical across adapters — only the service's base class and DI wiring change.

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
// user.service.ts
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
// user.service.ts
import { DrizzleCrudService } from '@nestjs-crud/drizzle';
import { users } from './schema';
import type { db } from './db';  // your Drizzle instance type

@Injectable()
export class UsersService extends DrizzleCrudService<typeof users.$inferSelect> {
  constructor(@Inject('DB') drizzleDb: typeof db) {
    super(drizzleDb, users);  // (db instance, table reference)
  }
}
```

### MikroORM service

```typescript
// user.service.ts
import { MikroOrmCrudService } from '@nestjs-crud/mikro-orm';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';

@Injectable()
export class UsersService extends MikroOrmCrudService<User> {
  constructor(@InjectRepository(User) repo: EntityRepository<User>) {
    super(repo);
  }
}
```

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

**Supported operators** (23 total — `CondOperator` enum in `@nestjs-crud/request`):

- Equality: `$eq`, `$ne`
- Comparison: `$gt`, `$gte`, `$lt`, `$lte`
- Range: `$between` (value = `[min, max]`)
- Null checks: `$isnull`, `$notnull`
- Set membership: `$in`, `$notin`
- String match: `$cont`, `$excl`, `$starts`, `$ends`
- Case-insensitive counterparts: `$eqL`, `$neL`, `$inL`, `$notinL`, `$contL`, `$exclL`, `$startsL`, `$endsL`

**Raw params:** `?filter=name||$cont||john&sort=createdAt,DESC&limit=25&page=2&join=profile`

## `@Crud()` Key Options

```typescript
@Crud({
  model: { type: Entity },          // required

  dto: {                            // optional — separate DTO classes (see "DTOs" below)
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
    cache: 2000,                     // ms — TypeORM only; Drizzle/MikroORM silently no-op the option
    alwaysPaginate: false,           // force pagination
    softDelete: false,               // enables `recoverOneBase` + hides soft-deleted rows from reads
    join: {
      relation: {
        eager: true,                 // always join
        allow: ['id', 'name'],       // field whitelist
        exclude: ['secret'],         // field blacklist
        required: false,             // LEFT vs INNER JOIN
      },
    },
    filter: [{ field: 'deletedAt', operator: '$isnull' }], // always-on filter
    sort: [{ field: 'id', order: 'ASC' }],                 // default sort
    exclude: ['password'],                                  // never return these fields
  },

  routes: {
    exclude: ['createManyBase', 'recoverOneBase'],          // disable routes
    getManyBase:   { decorators: [UseGuards(AuthGuard)] },  // per-route extras
    createOneBase: { returnShallow: false },                // true → return created row w/o re-fetch
    updateOneBase: { allowParamsOverride: false, returnShallow: false },
    replaceOneBase:{ allowParamsOverride: false, returnShallow: false },
    deleteOneBase: { returnDeleted: false },                // true → return the deleted row
    recoverOneBase:{ returnRecovered: false },              // true → return the recovered row
  },

  params: {
    id: { field: 'id', type: 'uuid', primary: true },      // custom primary key
  },

  validation: { whitelist: true },  // optional — ValidationPipeOptions, or `false` to disable
  routesFactory: MyCustomFactory,   // optional — subclass of CrudRoutesFactory for advanced cases
})
```

`recoverOneBase` requires `query.softDelete: true` in the decorator or global config AND a soft-delete column on the entity.

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
- `persist` — appended to every write (prevents spoofing authorId)
- `property` — where to find the user on `req` (default: `'user'`)

## Overriding Generated Routes

```typescript
@Crud({ model: { type: User } })
@Controller('users')
export class UsersController implements CrudController<User> {
  constructor(public service: UsersService) {}

  // Override a read route
  @Override('getOneBase')
  @UseInterceptors(MyInterceptor)
  getUser(
    @ParsedRequest() req: CrudRequest,
    @Param('id') id: string,
  ) {
    return this.service.getOne(req); // delegate parsed request to service
  }

  // Override a write route — use @ParsedBody(), NOT @Body()
  @Override('createOneBase')
  createUser(
    @ParsedRequest() req: CrudRequest,
    @ParsedBody() dto: User,          // @ParsedBody() carries validation groups; @Body() does not
  ) {
    return this.service.createOne(req, dto);
  }
}
```

`@Override` accepts: `'getManyBase'`, `'getOneBase'`, `'createOneBase'`, `'createManyBase'`, `'updateOneBase'`, `'replaceOneBase'`, `'deleteOneBase'`, `'recoverOneBase'`.

## DTOs — Two Supported Patterns

**Pattern A: Entity-as-DTO (easy path, default).** Use `class-validator` groups on the entity — one class serves both as persistence model and input validation shape.

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

**Pattern B: Dedicated DTO classes** via `@Crud({ dto: { create, update, replace } })`. Use when the write shape differs meaningfully from the entity (nested input, computed fields, API-surface hardening, OpenAPI docs that should NOT leak internal columns):

```typescript
export class CreateUserDto {
  @IsNotEmpty() @IsString() name: string;
  @IsEmail() email: string;
  // no `id`, no `deletedAt`, no `password` — client can't submit these
}

export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsEmail() email?: string;
}

@Crud({
  model: { type: User },
  dto: { create: CreateUserDto, update: UpdateUserDto, replace: CreateUserDto },
})
@Controller('users')
export class UsersController implements CrudController<User> { ... }
```

With `dto`, the controller validates the incoming body against the DTO class — `CrudValidationGroups` is NOT used (the DTO itself defines per-op shape). Use Pattern B when strict API boundary matters; Pattern A when the entity is already a clean input shape.

**Output serialization is separate:** use `serialize: { getMany, get, create, ... }` in `@Crud()` to transform responses through a DTO with `class-transformer`. Combine freely — Pattern A entity-in + `serialize` DTO out is a common shape.

## Swagger

Install `@nestjs/swagger` — documentation auto-generates. No extra configuration. If not installed, the library silently skips Swagger decoration (via `safeRequire` internally).

**v2 heads-up:** `ParamOption.enum` references the internal `SwaggerEnumType` import from `@nestjs/swagger/dist/types/swagger-enum.type`. v2 inlines this type — if you import the same internal path directly, that import breaks in v2 (one-line swap). Your `enum: [...]` usage continues to work in v2 unchanged. (No `@deprecated` IDE warning ships in v1.0.2 source despite earlier release notes — the annotation pass was deferred.)

## Best Practices

**Use `CondOperator` enum — never raw operator strings.**
`'$cont'` silently misspells; `CondOperator.CONTAINS` is caught by TypeScript.
```typescript
// ❌  { operator: '$cont' }         — typos compile fine
// ✅  { operator: CondOperator.CONTAINS }
import { CondOperator } from '@nestjs-crud/request';
```

**Use `CrudValidationGroups` constants — never magic strings.**
```typescript
// ❌  @IsOptional({ groups: ['update'] })   — 'update' !== CrudValidationGroups.UPDATE
// ✅
import { CrudValidationGroups } from '@nestjs-crud/core';
const { CREATE, UPDATE } = CrudValidationGroups;
@IsOptional({ groups: [UPDATE] })
```

**Use `@ParsedBody()` not `@Body()` in write overrides.**
`@Body()` bypasses `class-validator` group selection — CREATE and UPDATE validation become identical. `@ParsedBody()` carries the correct group.

**Always `exclude` sensitive fields in `query` config.**
```typescript
@Crud({ query: { exclude: ['password', 'secretToken'] } })
```
Without this, a client can request `fields=password` and get it back.

**Always `allow`-list join fields on sensitive relations.**
```typescript
join: {
  profile: { allow: ['bio', 'avatarUrl'] }  // never exposes profile.privateKey etc.
}
```
Without `allow`, a joined relation returns all its columns.

**Use `search` for complex AND/OR — `filter` is AND-only.**
```typescript
// ❌ filter stacks ANDs — can't express OR across different fields
// ✅ search supports $and / $or nesting
const qb = RequestQueryBuilder.create()
  .search({
    $or: [
      { name: { $contL: 'alice' } },
      { email: { $contL: 'alice' } },
    ],
  });
// Raw: ?s={"$or":[{"name":{"$contL":"alice"}},{"email":{"$contL":"alice"}}]}
```

**Set `maxLimit` server-side — never trust client `limit` alone.**
A client that omits `limit` or sends a huge value gets all rows without `maxLimit`.

**`@UseGuards()` must come before `@CrudAuth()` can read `req.user`.**
Place auth guard on the controller class (not individual routes) so it runs before `CrudRequestInterceptor` resolves `property` from `req`.

## Common Issues

**Relations not loading:** Add the relation to `query.join` in `@Crud()`. Without it, join requests from the client are silently ignored.

**`maxLimit` exceeded → 400:** Client sent `limit` above `maxLimit`. Raise `maxLimit` or set `alwaysPaginate: false`.

**Validation always fails on update:** Make sure fields use `@IsOptional({ groups: [UPDATE] })` — without it, UPDATE validation is as strict as CREATE.

**`@CrudAuth` filter not applying:** Ensure your auth guard runs BEFORE `CrudRequestInterceptor`. Guard must populate `req.user` (or your configured `property`) for the filter to resolve.

**Empty response / flat array instead of `{ data, count, total, page, pageCount }`:** `getManyBase` returns a flat array by default. Set `alwaysPaginate: true` inside the `query:` block in `@Crud()` (NOT top-level):
```typescript
@Crud({ model: { type: User }, query: { alwaysPaginate: true } })
```
Or set it globally once via `CrudConfigService.load({ query: { alwaysPaginate: true } })`.

**`TypeError: repo.createQueryBuilder is not a function` / `Cannot find module 'typeorm'`:** TypeORM peer not installed. See the "Heads-up (v1.0.2)" note in the Install section — `@nestjs-crud/typeorm` does not yet declare peerDependencies, so `npm install` doesn't warn. Run `yarn add typeorm @nestjs/typeorm @nestjs/common` (or the equivalent for your ORM adapter).

**Swagger routes documented but metadata missing / empty:** `@nestjs/swagger` not installed as a peer. The library's `safeRequire` silently skips Swagger setup when the peer is absent. Install `@nestjs/swagger` and restart.

**`@CrudAuth` filter applies but persisted writes have wrong values (or are missing):** v1 silently ignores typos in `@CrudAuth({ persist: { user_id: ... } })` when the entity column is `userId`. The auth-filter side often appears to work, but `persist` quietly drops the unrecognized key — auth-filter bypass on writes. **Audit every `@CrudAuth({ persist: {...} })` block by hand against entity column names**; v1 won't catch typos at runtime. v2 does (throws `RequestQueryException`).

**MikroORM: stale entity returned across requests, or `em.flush()` doesn't persist:** Subclass cached `em` at constructor time, breaking per-request identity-map isolation. Don't store `em` as a field — resolve it fresh inside every method (`this.em.fork()` or per your DI setup). Same gotcha applies in v2 (where it's structurally enforced via a `getEm` thunk).

**`@Crud({ query: { cache: 5000 } })` does nothing on Drizzle/MikroORM:** Only the TypeORM adapter honors the `cache` option. Drizzle and MikroORM silently no-op it. Use each ORM's native caching primitive at the application layer instead. (v2 fail-fasts on TypeORM when the `DataSource` cache provider is missing; Drizzle/MikroORM behavior unchanged.)

## Staying on v1 vs. Upgrading to v2

**To stay on v1:** pin `^1.0.2` in your `package.json`:

```json
{
  "dependencies": {
    "@nestjs-crud/core": "^1.0.2",
    "@nestjs-crud/typeorm": "^1.0.2"
  }
}
```

`npm update` continues to track the v1.0.x line. The v1.0.x line continues to receive bugfix patches.

**To upgrade to v2:** v2 is a coordinated breaking release. See the `nestjs-crud-migration` skill for the full change list (strict allowlist validation, deleted service internals, new `QueryTranslator<Q, W>` contract, MikroORM `getEm` thunk, write-path transaction wrap, Prisma adapter, etc.). For v2-specific surfaces (Prisma adapter, split-query opt-in, fail-fast cache), see the `nestjs-crud-v2` skill.
