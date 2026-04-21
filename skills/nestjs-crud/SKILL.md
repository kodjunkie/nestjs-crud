---
name: nestjs-crud
description: Use when integrating @nestjs-crud into a NestJS project — setting up CRUD controllers, configuring query filters and pagination, scoping requests with @CrudAuth, overriding generated endpoints, or troubleshooting relations, validation, and Swagger.
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

Peer deps required: `class-validator`, `class-transformer`. Swagger is optional — install `@nestjs/swagger` and decoration auto-generates.

## Quickstart

```typescript
// user.service.ts
@Injectable()
export class UsersService extends TypeOrmCrudService<User> {
  constructor(@InjectRepository(User) repo: Repository<User>) {
    super(repo);
  }
}

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

**Supported operators:** `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$notin`, `$isnull`, `$notnull`, `$cont`, `$excl`, `$starts`, `$ends`, `$contL`, `$exclL`, `$startsL`, `$endsL`

**Raw params:** `?filter=name||$cont||john&sort=createdAt,DESC&limit=25&page=2&join=profile`

## `@Crud()` Key Options

```typescript
@Crud({
  model: { type: Entity },          // required

  query: {
    limit: 25,                       // default page size
    maxLimit: 100,                   // hard cap
    cache: 2000,                     // ms (TypeORM only)
    alwaysPaginate: false,           // force pagination
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
    getManyBase: { decorators: [UseGuards(AuthGuard)] },   // per-route extras
  },

  params: {
    id: { field: 'id', type: 'uuid', primary: true },      // custom primary key
  },
})
```

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

## Entity-as-DTO Validation

No separate DTO classes needed — use `class-validator` groups on the entity:

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

## Swagger

Install `@nestjs/swagger` — documentation auto-generates. No extra configuration. If not installed, the library silently skips Swagger decoration (via `safeRequire` internally).

**Note:** `ParamOption.enum` in `@nestjs-crud/core` is marked `@deprecated` in v1.0.2 — the internal Swagger type it references will change in v2. Your code using `enum` continues to work; you'll just see a deprecation warning in your IDE.

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

**Empty response instead of `{ data, count, total, page, pageCount }`:** `getManyBase` returns a flat array by default. Set `alwaysPaginate: true` in `@Crud()` query options to always return the paginated shape.

**`@deprecated` IDE warnings on `DrizzleCrudService.db` or `MikroOrmCrudService`:** Expected in v1.0.2 — these surfaces change in v2. No action needed; code continues to work.
