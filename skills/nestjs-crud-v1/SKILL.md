---
name: nestjs-crud-v1
description: >-
  Use when integrating @nestjs-crud v1.0.x (legacy maintenance line) — wiring TypeORM/Drizzle/MikroORM, configuring `@Crud()`/`@CrudAuth()`/`@Override()`, debugging `getManyBase returned a flat array`, `@CrudAuth filter not applying` (or persist-key typos silently dropped → auth-filter bypass on writes), `validation always fails on update`, `maxLimit exceeded`, `repo.createQueryBuilder is not a function` after install, MikroORM stale entity across requests, `@Crud({ query: { cache } })` silent no-op on Drizzle/MikroORM. Pin `^1.0.2` for new installs. Migration guide: nestjs-crud-migration skill.
---

# @nestjs-crud (v1.0.x — legacy)

Auto-generates RESTful CRUD endpoints from a single `@Crud()` decorator. Three adapters: TypeORM, Drizzle, MikroORM. Maintenance-line only — new projects should use v2.

## Install

```bash
# Pick adapter
npm install @nestjs-crud/core @nestjs-crud/typeorm
npm install @nestjs-crud/core @nestjs-crud/drizzle
npm install @nestjs-crud/core @nestjs-crud/mikro-orm

# Optional frontend query builder
npm install @nestjs-crud/request
```

**Required peer deps (install explicitly — v1 does NOT declare them):**

- `@nestjs-crud/core` peers: `class-validator`, `class-transformer`
- `@nestjs-crud/typeorm` ALSO needs: `typeorm`, `@nestjs/typeorm`, `@nestjs/common`
- `@nestjs-crud/drizzle` ALSO needs: `drizzle-orm` (≥ 0.36.0), `@nestjs/common`
- `@nestjs-crud/mikro-orm` ALSO needs: `@mikro-orm/core` (≥ 6.0.0), `@mikro-orm/knex` (≥ 6.0.0), `@nestjs/common`

`npm install` will NOT warn if you forget. Symptoms at runtime: `TypeError: repo.createQueryBuilder is not a function` or `Cannot find module 'typeorm'`. Fixed in v2 (every adapter declares full peers).

Swagger optional — install `@nestjs/swagger` to enable; library `safeRequire`-skips when absent.

## Global Defaults — `CrudConfigService.load()`

Set project-wide defaults in `main.ts` BEFORE `NestFactory.create`. Every `@Crud()` deep-merges; controller scalars win, arrays replace.

```typescript
// src/main.ts
import { CrudConfigService } from '@nestjs-crud/core';

CrudConfigService.load({
  query: { limit: 25, maxLimit: 100, alwaysPaginate: true, cache: 2000, softDelete: false },
  routes: { updateOneBase: { allowParamsOverride: false }, deleteOneBase: { returnDeleted: false } },
  params: { id: { field: 'id', type: 'number', primary: true } },
  serialize: { getMany: false },
  auth: { property: 'user' },
});

const app = await NestFactory.create(AppModule);
```

Default without `load()`: `alwaysPaginate: false`, no global params, no auth defaults.

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
@Injectable()
export class UsersService extends MikroOrmCrudService<User> {
  constructor(em: EntityManager) {
    super(em, User);
  }
}
```

`MikroOrmCrudService` accepts `EntityManager` directly. For `@InjectRepository(User)` style, unwrap manually:

```typescript
constructor(@InjectRepository(User) repo: EntityRepository<User>) {
  super(repo.getEntityManager(), User);
}
```

(v2.2.0+ accepts `EntityManager | EntityRepository<T>` directly — no unwrap.)

## Generated Endpoints

| Method   | Path                 | Handler          |
| -------- | -------------------- | ---------------- |
| `GET`    | `/users`             | `getManyBase`    |
| `GET`    | `/users/:id`         | `getOneBase`     |
| `POST`   | `/users`             | `createOneBase`  |
| `POST`   | `/users/bulk`        | `createManyBase` |
| `PATCH`  | `/users/:id`         | `updateOneBase`  |
| `PUT`    | `/users/:id`         | `replaceOneBase` |
| `DELETE` | `/users/:id`         | `deleteOneBase`  |
| `POST`   | `/users/:id/recover` | `recoverOneBase` |

## Query Params (Frontend → Backend)

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
    cache: 2000,                                          // ms — TypeORM only; Drizzle/MikroORM no-op
    alwaysPaginate: false,
    softDelete: false,                                    // enables recoverOneBase
    join: { rel: { eager: true, allow: ['id', 'name'], exclude: ['secret'], required: false } },
    filter: [{ field: 'deletedAt', operator: '$isnull' }],
    sort: [{ field: 'id', order: 'ASC' }],
    exclude: ['password'],
  },

  routes: {
    exclude: ['createManyBase'],
    updateOneBase: { allowParamsOverride: false, returnShallow: false },
    deleteOneBase: { returnDeleted: false },
  },

  params: { id: { field: 'id', type: 'uuid', primary: true } },
  validation: { whitelist: true },
})
```

`recoverOneBase` requires `query.softDelete: true` + soft-delete column on entity.

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
- `persist` — set on every write (prevents spoofing)
- `property` — where to find user on `req` (default `'user'`)

**v1 footgun:** `persist` typos against entity column names are SILENTLY dropped at runtime. `persist: { user_id: ... }` against entity column `userId` = auth-filter bypass on writes. Audit every `@CrudAuth({ persist: {...} })` block by hand. v2 throws `RequestQueryException` on typo.

**Guard ordering:** `@UseGuards()` MUST come before `@CrudAuth()` reads `req.user`. Place auth guard on controller class.

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

`@Override` accepts: `getManyBase`, `getOneBase`, `createOneBase`, `createManyBase`, `updateOneBase`, `replaceOneBase`, `deleteOneBase`, `recoverOneBase`.

## DTOs — Two Patterns

**Pattern A: Entity-as-DTO (default).** `class-validator` groups on entity:

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
}
```

`CREATE` runs on POST + PUT; `UPDATE` on PATCH; `{ always: true }` on both.

**Pattern B: Dedicated DTO classes** via `@Crud({ dto: { create, update, replace } })`. Use when write shape differs meaningfully from entity (nested input, computed fields, OpenAPI hardening). With `dto`, `CrudValidationGroups` is NOT used — controller validates against DTO class directly.

**Output serialization is separate.** Combine entity-in (Pattern A) + DTO-out (`@Crud({ serialize: {...} })`) freely.

## Swagger

Install `@nestjs/swagger` — auto-generates. Library `safeRequire`-skips when absent.

**v2 heads-up:** `ParamOption.enum`'s `SwaggerEnumType` is internal-import-pathed in v1 (`@nestjs/swagger/dist/types/swagger-enum.type`); v2 inlines it (one-line swap if you import same path directly). v2 also rewrites default Swagger text + adds `@Crud({ swagger: {...} })` override surface — snapshot-test OpenAPI? Expect drift. See `nestjs-crud-migration` skill §Swagger.

## Best Practices

- **`CondOperator` enum, never raw strings.** `'$cont'` silently misspells; `CondOperator.CONTAINS` is TypeScript-checked.
- **`CrudValidationGroups` constants, never magic strings.** `'update'` !== `CrudValidationGroups.UPDATE`.
- **`@ParsedBody()` not `@Body()` in write overrides.** `@Body()` bypasses group selection.
- **Always `exclude` sensitive fields in `query` config.** Without it, `?fields=password` returns it.
- **Always `allow`-list join fields on sensitive relations.** Without `allow`, joined relation returns all columns.
- **Use `search` for AND/OR composition; `filter` is AND-only.** Raw: `?s={"$or":[{"name":{"$contL":"a"}},{"email":{"$contL":"a"}}]}`
- **Set `maxLimit` server-side — never trust client `limit` alone.** Client omitting `limit` returns all rows without `maxLimit`.
- **`@UseGuards()` on controller class, not individual routes.** Runs before `CrudRequestInterceptor` resolves `property` from `req`.

## Common Issues

| Symptom | Cause + Fix |
|---------|-------------|
| Relations not loading | Add to `query.join`. Without it, client join requests silently ignored. |
| `maxLimit` exceeded → 400 | Raise `maxLimit` or set `alwaysPaginate: false`. |
| Validation always fails on update | Fields need `@IsOptional({ groups: [UPDATE] })`. |
| `@CrudAuth` filter not applying | Auth guard must run BEFORE `CrudRequestInterceptor`. Place `@UseGuards()` on class. |
| Flat array instead of `{ data, count, total, page, pageCount }` | Set `alwaysPaginate: true` inside `query:` (NOT top-level) or via `CrudConfigService.load()`. |
| `TypeError: repo.createQueryBuilder is not a function` / `Cannot find module 'typeorm'` | Adapter peer not installed. v1 doesn't declare peers — install per §Install list manually. |
| Swagger metadata empty | `@nestjs/swagger` not installed. `safeRequire` skips Swagger setup; install + restart. |
| `@CrudAuth` filter applies but persisted writes have wrong values (or missing) | **v1 silently drops typos in `@CrudAuth({ persist: {...} })` against entity columns.** Auth-filter bypass on writes. Audit every persist block by hand. v2 throws `RequestQueryException`. |
| MikroORM: stale entity across requests / `em.flush()` doesn't persist | Subclass cached `em` at constructor time, breaking per-request identity-map isolation. Resolve `em` fresh inside every method. v2 enforces structurally via `getEm` thunk. |
| `@Crud({ query: { cache: N } })` does nothing on Drizzle/MikroORM | Only TypeORM honors `cache` in v1. Drizzle/MikroORM silently no-op. Use ORM's native cache primitive at app layer. v2: unified `CacheStrategy` interface across all 4 adapters. |

## Pinning v1.0.x

```json
{
  "dependencies": {
    "@nestjs-crud/core": "^1.0.2",
    "@nestjs-crud/typeorm": "^1.0.2"
  }
}
```

`npm update` continues to track v1.0.x. Bugfix patches still land. New features land in v2 only — see `nestjs-crud-migration` skill for upgrade path.
