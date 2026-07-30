# Cursor Pagination

`@nestjs-crud` ships opt-in cursor pagination on `getManyBase` via `@Crud({ query: { pagination: 'cursor' } })`. The default `'offset'` mode is preserved unchanged. All four adapters (TypeORM, MikroORM, Drizzle, Prisma) honor the same controller decorator with identical request/response shapes.

## Overview

Cursor pagination is a keyset-based alternative to offset pagination. Instead of `?page=N&limit=M`, the consumer round-trips an opaque cursor token: the first page comes back with a `cursor.next` token, which the consumer passes back as `?cursor=<token>` to fetch the next page.

Reach for cursor mode when:

- You serve **infinite-scroll feeds, activity streams, or notification timelines** where consumers walk forward and rarely jump.
- The dataset is **large and writes concurrently** with reads — keyset pagination is stable across inserts and deletes in a way `OFFSET` cannot be (offset N+1 silently shifts when row N is deleted).
- A `COUNT(*)` over the base set would be **expensive or irrelevant** to the UI.

Stay on offset (the default) when consumers need random page jumps, paginated tables that display a total page count, or cacheable list responses.

## Setup

```ts
import { Controller } from '@nestjs/common';
import { Crud, CrudController } from '@nestjs-crud/core';

import { User } from './entities/user.entity';
import { UsersService } from './users.service';

@Crud({
  model: { type: User },
  query: {
    pagination: 'cursor',
    limit: 25,
  },
})
@Controller('users')
export class UsersController implements CrudController<User> {
  constructor(public service: UsersService) {}
}
```

`limit` is required in cursor mode — either `query.limit`, `query.maxLimit`, or a per-request `?limit=N` must resolve to a finite value. Cursor pagination over an unbounded result set defeats its purpose; missing the `limit` returns `400 Bad Request`.

A single sort field is required (the library auto-appends the primary key as a stable tie-breaker). Multi-sort and cursor pagination together return `400 Bad Request` — see [Caveats](#caveats) and [Sort resolution](#sort-resolution).

## Sort resolution

Cursor mode needs exactly one sort field. The library appends the primary key as a tie-breaker automatically, so you supply zero fields or one, never more.

The effective sort resolves in order: the request's `?sort=` query parameter first, then the route's `@Crud({ query: { sort } })` default when the request supplies none. This is the same order offset mode already uses.

Nothing is inferred past those two sources. A route with no default and a request with no `?sort=` returns `400` — the library does not fall back to primary-key order. A route default declaring two or more fields also returns `400`, even though a single-field default works fine. Using the first field of an over-specified default would hide a route misconfiguration instead of catching it.

Available from v2.2.6.

| Condition | Message |
| --- | --- |
| Request query string supplies 2+ sort fields | `Cursor pagination supports a single sort field; the request query string supplied ${n} fields: ${fields}` |
| Route default declares 2+ sort fields and the request supplies none | `Cursor pagination supports a single sort field; the route's @Crud({ query: { sort } }) default declares ${n} fields: ${fields}` |
| Neither the request nor the route supplies a sort field | `Cursor pagination supports a single sort field; none was provided — pass ?sort=field,ASC in the request query string, or set @Crud({ query: { sort } }) on the route` |

## Response shape

```json
{
  "data": [ /* T[] */ ],
  "count": 25,
  "cursor": {
    "next": "eyJzb3J0RmllbGQiOiJpZCIsInNvcnRWYWx1ZSI6MjUsImlkIjoyNSwiZGlyIjoibmV4dCJ9",
    "prev": null
  }
}
```

`data` and `count` mirror the offset response. `total`, `page`, and `pageCount` are intentionally absent — the library never runs the `COUNT(*)` that those fields would require, which is most of the cost saving cursor mode is buying you. `count` is the size of `data` for the current page only.

`cursor.next` is `null` on the last page; `cursor.prev` is `null` on the first page.

The TypeScript type is exported from `@nestjs-crud/core/cursor`:

```ts
import type { CursorPaginatedResponse } from '@nestjs-crud/core/cursor';

const page: CursorPaginatedResponse<User> = await fetch('/users').then((r) => r.json());
```

## Forward and back navigation

Direction is encoded **inside** the cursor token. The consumer round-trips the same `?cursor=<token>` parameter regardless of direction — there is no separate `?direction=next|prev` query parameter.

```
GET /users
  → { data: [u1..u25], count: 25, cursor: { next: 'NEXT_25', prev: null } }

GET /users?cursor=NEXT_25
  → { data: [u26..u50], count: 25, cursor: { next: 'NEXT_50', prev: 'PREV_26' } }

GET /users?cursor=PREV_26
  → { data: [u1..u25], count: 25, cursor: { next: 'NEXT_25', prev: null } }
```

The library supports **single-page forward and back navigation**. Multi-page jumps (e.g. "go back three pages") are the consumer's responsibility — keep a stack of cursor tokens client-side and pop them as the user navigates back.

This is the same pattern TanStack Query's `useInfiniteQuery` is designed for:

```ts
import { useInfiniteQuery } from '@tanstack/react-query';

function useUsers() {
  return useInfiniteQuery({
    queryKey: ['users'],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const url = pageParam ? `/users?cursor=${pageParam}` : '/users';
      const res = await fetch(url);
      return res.json() as Promise<CursorPaginatedResponse<User>>;
    },
    getNextPageParam: (last) => last.cursor.next,
    getPreviousPageParam: (first) => first.cursor.prev,
  });
}
```

## Caveats

> **Cursor opaque, NOT signed. Do not rely on cursor for authorization. Authorization stays in @CrudAuth.**

The cursor token is a base64-url-encoded JSON object containing `{ sortField, sortValue, id, dir }`. It is opaque to consumers but **not** cryptographically signed or encrypted. A determined attacker can decode and modify it. Do not put authorization decisions on the cursor — keep tenant filtering, ownership checks, and any other access constraints in `@CrudAuth({ filter | or | persist })`, which AND-combines with the cursor's keyset WHERE clause on every request.

Five additional caveats:

1. **Cursor mode bypasses the query cache.** The unified `CacheStrategy` wrap is skipped on cursor reads. Per-cursor cache key cardinality is unbounded — every cursor token is a unique key, so caching cursor reads pollutes the cache with one-shot entries that are never reused. Use offset mode for cacheable list responses.
2. **Single sort field required.** Multi-sort with `pagination: 'cursor'` returns `400 Bad Request`. The library appends the primary key as the tie-breaker automatically; consumers supply zero or one explicit sort field. Mismatch between the cursor's encoded `sortField` and the request's sort field also returns `400`. See [Sort resolution](#sort-resolution) for where that field comes from and the exact 400 messages.
3. **`limit` required.** Missing `limit` returns `400 Bad Request`. Set it on the controller via `query.limit` / `query.maxLimit`, or per-request via `?limit=N`.
4. **Cursor stability under concurrent writes.** A row deleted between forward and back navigation is simply absent from the result — keyset comparison still resolves the page boundary correctly. Inserts that fall between two cursor positions appear on the next forward fetch.
5. **Token length capped.** Cursor tokens beyond 1024 characters return `400 Bad Request` (DoS guard against payload-of-doom decode attempts). Standard tokens are well under 100 characters; any payload longer than the cap is by definition tampered or malformed.

### Operational guidance: rate limiting

Cursor pagination amplifies DoS surface relative to offset mode because (a) cursor mode bypasses the query cache (each request hits the database) and (b) the cursor token is a stable continuation handle, so an adversary holding a valid cursor can spam page requests at a known-good token. Consumers running cursor controllers in production SHOULD wrap the controller with [`@nestjs/throttler`](https://docs.nestjs.com/security/rate-limiting):

```ts
import { Throttle } from '@nestjs/throttler';

@Throttle({ default: { limit: 100, ttl: 60_000 } })
@Crud({ model: { type: User }, query: { pagination: 'cursor', limit: 25 } })
@Controller('users')
export class UsersController implements CrudController<User> {
  constructor(public service: UsersService) {}
}
```

`@nestjs/throttler` runs at the controller layer (as a Guard), upstream of `getManyBase`. The library does not enforce rate limiting itself — that is a deployment policy, not a library policy.

## Tradeoffs vs offset

> **Use cursor for streams/feeds where total is irrelevant or expensive; use offset for paginated tables that need totals.**

| Property                          | Cursor                                      | Offset                                  |
| --------------------------------- | ------------------------------------------- | --------------------------------------- |
| Stability under concurrent writes | Stable (keyset over an indexed column)      | Drift (N+1 shifts when row N is deleted) |
| Includes total count              | No (`total` / `page` / `pageCount` absent) | Yes (one `COUNT(*)` per request)         |
| Random page access                | No (forward/back from current page only)    | Yes (`?page=N`)                          |
| Cost per page                     | O(limit) — index seek + range scan          | O(offset + limit) — full scan to offset |
| Query-cache wrap                  | Bypassed (per-cursor key cardinality)       | Honored (`@Crud({ query: { cache } })`) |
| Required sort                     | Single field (auto PK tail appended)        | Any                                      |
| Required limit                    | Yes (`400` if missing)                      | Optional (`maxLimit` recommended)        |

## Per-adapter notes

All four adapters implement `QueryComposer.applyCursor` — the same `pagination: 'cursor'` knob produces functionally identical request/response semantics across TypeORM, MikroORM, Drizzle, and Prisma.

| Adapter   | Mechanism                                                                          | Notes                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| TypeORM   | `SelectQueryBuilder.andWhere` with parameterized OR-decomposed keyset             | Composes naturally with the existing sort branch; cache wrap bypass at the FetchHelper layer.                                      |
| Drizzle   | `or(gt/lt(sortCol, v), and(eq(sortCol, v), gt/lt(idCol, id)))`                     | Pattern from the official Drizzle cursor-pagination guide. PK tie-breaker via `asc`/`desc`.                                        |
| MikroORM  | Smart-query `andWhere({ $or: [...] })`                                              | Composer remains `em`-free; the service freshly resolves `em` per call (request-scope identity-map invariant preserved).           |
| Prisma    | OR-decomposed `where` merged with existing `where` (auth + soft-delete preserved) | Prisma's built-in `cursor:` argument is **intentionally bypassed** — it is single-column unique-key only and cannot accept a tuple. |

### Internals: SQL injection guard for `sortField`

Cursor mode reuses the same strict field allowlist as offset mode's sort branch. The `sortField` decoded from the cursor token MUST resolve through the per-adapter allowlist; an unknown field returns `400 Bad Request` with `Invalid sort field`. Allowlist source per adapter:

| Adapter   | Allowlist source       |
| --------- | ---------------------- |
| TypeORM   | `entityColumnsHash`    |
| Drizzle   | `columnsMap`           |
| MikroORM  | `propertiesMap`        |
| Prisma    | `entityColumns`        |

This guard is the same one that protects offset-mode `?sort=` against unknown fields — cursor mode does not introduce a new attack surface; it inherits the existing one.

## See also

- [Controllers](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers) — offset pagination on `@Crud({ query: { limit, maxLimit } })`
- [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching) — `CacheStrategy` interface (offset-only)
- [Query Syntax](https://github.com/kodjunkie/nestjs-crud/wiki/Query-Syntax) — `?sort=`, `?filter=`, `?search=`, `?limit=`, `?cursor=`
- TanStack Query `useInfiniteQuery`: https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries
- `@nestjs/throttler`: https://docs.nestjs.com/security/rate-limiting
