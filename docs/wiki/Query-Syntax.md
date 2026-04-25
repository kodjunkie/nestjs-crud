# Query Syntax

`@nestjs-crud` parses a set of conventional query-string parameters on every generated `getManyBase` and `getOneBase` route. This page is the reference target for the Swagger UI parameter descriptions emitted by `@Crud()`-generated routes; every parameter doc-link points at one of the anchors below.

For the higher-level [Requests](Requests) page (frontend `RequestQueryBuilder` usage and the full condition operator list), see the [Requests](Requests) wiki page. For soft-delete configuration, see [Controllers](Controllers) and the per-adapter service pages.

A route wired as:

```ts
@Crud({
  model: { type: User },
  query: {
    softDelete: true,
    join: {
      company: { exclude: ['description'] },
      profile: { eager: true, exclude: ['updatedAt'] },
    },
  },
})
@Controller('/companies/:companyId/users')
export class UsersController implements CrudController<User> {
  constructor(public service: UsersService) {}
}
```

accepts every query parameter described below on `GET /companies/:companyId/users` and `GET /companies/:companyId/users/:id`.

## select

Comma-separated list of resource fields to return. An empty or missing `fields` parameter returns every non-virtual column the service exposes.

The default query-string key is `fields` (alias `select`). Primary key columns are always included in the response, regardless of the selection list.

```
GET /companies/1/users?fields=id,name,email
```

## search

A MongoDB-like JSON search tree sent as the `s` query parameter. Supports `$and`, `$or`, and the full condition operator set (`$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$cont`, `$starts`, `$ends`, `$in`, `$notin`, `$isnull`, `$notnull`, `$between`, and their case-insensitive `L`-suffixed variants).

When `s` is present, both `filter` and `or` are ignored; `s` is the richer composable form. The value must be URL-encoded; most clients should reach for `RequestQueryBuilder` from `@nestjs-crud/request` instead of hand-encoding.

```
GET /companies/1/users?s={"name":{"$cont":"ali"}}
```

```
GET /companies/1/users?s={"$or":[{"isActive":false},{"updatedAt":{"$notnull":true}}]}
```

## filter

Single condition expressed as `field||operator||value`. Repeating the `filter` parameter AND-combines conditions. For the full operator list, see the [Requests](Requests#filter-conditions) page.

Nested fields require a corresponding `join` parameter so the relation is loaded before the filter resolves against it.

```
GET /companies/1/users?filter=age||$gte||18
```

```
GET /companies/1/users?filter=isActive||$eq||true&filter=profile.firstName||$cont||ali
```

## or

Single `OR` condition expressed with the same `field||operator||value` shape as `filter`. Interaction rules:

- A single `or` (no `filter`) behaves like a single `filter`.
- Multiple `or` parameters combine as `OR ... OR ...`.
- `or` combined with `filter` yields `WHERE (filter AND filter AND ...) OR (or AND or AND ...)`.

```
GET /companies/1/users?or=status||$eq||active
```

```
GET /companies/1/users?filter=type||$eq||hero&or=type||$eq||villain
```

## sort

Sort results by one or more fields. Each `sort` value is `field,ORDER` where `ORDER` is `ASC` or `DESC`. Repeat the parameter for a multi-column sort; ties are broken in the order the parameters appear.

Sort targets are validated against the service's allowed column set, so unknown columns fail fast with `400 Bad Request` rather than silently being ignored.

```
GET /companies/1/users?sort=name,ASC
```

```
GET /companies/1/users?sort=name,ASC&sort=id,DESC
```

## join

Load a related entity in the response. Syntax is `relation` to load every allowed column, or `relation||field1,field2,...` to load a subset. Relations must be allowed at the controller level via `@Crud({ query: { join } })`; unknown relations are silently ignored so controllers can expose a public-safe subset.

Nested joins require the parent level to be joined first. The parent relation must appear in the `join` parameter list before any `parent.child` entries.

```
GET /companies/1/users?join=profile||bio,avatar
```

```
GET /companies/1/users?join=company&join=company.projects
```

## limit

Maximum number of resources returned in the response body. Alias `per_page`. The controller's `@Crud({ query: { limit, maxLimit } })` settings cap the effective value; requests above `maxLimit` get clamped, not rejected.

```
GET /companies/1/users?limit=25
```

## offset

Skip the first N resources before returning the limited slice. Combine with `limit` for classic offset pagination. Use it alongside `sort` for deterministic paging order.

```
GET /companies/1/users?limit=25&offset=50
```

## page

One-based page index. Internally converted to `offset = (page - 1) * limit`. Provide `limit` alongside `page` for predictable page sizes; without `limit`, the controller default applies.

```
GET /companies/1/users?limit=25&page=2
```

## cache

Cache bypass flag. Set `cache=0` to skip the cache layer and read straight from the database. Any other value (or omitting the parameter) uses the cached result when available.

Cache configuration is wired only for TypeORM. See the [Caching](Caching) page for how to configure a cache provider on the `DataSource`. On adapters without native cache support (Drizzle, MikroORM, Prisma), the `cache` parameter is accepted but has no effect.

```
GET /companies/1/users?cache=0
```

## includeDeleted

Include soft-deleted rows in the response. Set `includeDeleted=1` to return rows where the soft-delete column (`deletedAt` by default) is non-null. Honored only when the controller opts in via `@Crud({ query: { softDelete: true } })`; on non-soft-delete controllers the parameter is ignored.

Applies to both `getManyBase` and `getOneBase`. For `getOneBase`, `includeDeleted=1` is the only way to fetch a soft-deleted row by id before calling `recoverOneBase`.

```
GET /companies/1/users?includeDeleted=1
```
