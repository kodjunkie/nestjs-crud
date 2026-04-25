# Relation load strategy

`@nestjs-crud/typeorm` exposes TypeORM's `relationLoadStrategy` choice through `@Crud({ query: { relationLoadStrategy } })` (added in v2.0.0). This page covers when to use each strategy, the divergence in alias-select behavior under `'query'`, and the N+1 vs. Cartesian-explosion tradeoff.

## TL;DR

- **Default (`'join'`)**: a single SQL with `LEFT JOIN`s per relation. Fast for shallow reads. Cartesian-explosion risk when one parent has multiple `OneToMany` relations.
- **Opt-in (`'query'`)**: separate `SELECT` per relation. Avoids Cartesian. Trades one query for N small queries. Custom field aliases (subquery-derived columns, for example) and relation-level `JoinOption.allow` filters do not carry through. See "Alias-select divergence" below.

## Why this matters

Relational loading has two failure modes:

1. **N+1 queries.** Read a parent row, then issue one query per child relation per parent. Death by a thousand round-trips.
2. **Cartesian explosion.** A single SQL with `LEFT JOIN` against multiple `OneToMany` relations multiplies row counts (parent × children₁ × children₂...). 100 parents × 10 comments × 10 tags = 10,000 rows for what should be 100 reads.

`'join'` avoids N+1 by issuing one query, at the cost of Cartesian explosion when relations fan out. `'query'` avoids Cartesian by issuing one query per relation. That is N additional queries, not true N+1: one query per relation, not one per parent row.

> N+1 is not always worse than one big JOIN. When relations fan out (1 → many → many), the JOIN multiplies parent rows by the cross-product of child counts, inflating bytes-on-the-wire and hurting pagination. Split queries trade per-request round-trips for linear-row payload. Pick by query shape.

**Rule of thumb:** prefer `'join'` for `ManyToOne`, `OneToOne`, and shallow `OneToMany`. Prefer `'query'` when you read multiple `OneToMany` relations on the same parent.

## Configuring per-controller

```typescript
import { Controller } from '@nestjs/common';
import { Crud } from '@nestjs-crud/core';

@Crud({
  model: { type: User },
  query: {
    relationLoadStrategy: 'query', // opt into separate-query loading
    join: {
      posts: { eager: true },
      comments: { eager: true },
      tags: { eager: true },
    },
  },
})
@Controller('users')
export class UsersController { /* ... */ }
```

The strategy applies to every eager-loaded relation on the controller's read endpoints (`getManyBase`, `getOneBase`).

## Configuring per-request

Consumers can override per-request via the `?relationLoadStrategy=` query param, when the controller's `@Crud` options allow it:

```
GET /users?join=posts,comments&relationLoadStrategy=query
```

If the controller does not allow per-request override, the query param is ignored.

## Alias-select divergence (`'query'` strategy)

When a request includes `fields=` selecting columns from joined relations, the two strategies diverge. The integration spec at `packages/typeorm/test/perf-01-relation-load-strategy.spec.ts` documents this:

- Under `'join'`, joined columns appear as aliased columns in the single SQL output (`"posts_title": "..."`). The composer's `getSelect` honors `?fields=` for top-level columns, and `JoinOption.allow` constrains relation columns at SQL-generation time.
- Under `'query'`, TypeORM's `setFindOptions` replaces the SELECT clause and drives column selection from `relations` only. `?fields=` is dropped on top-level columns (only the primary key is guaranteed), and `JoinOption.allow` is ignored: the entire relation row loads.

Concrete example against a `User → company` relation with `allow: ['name', 'domain']`:

| Strategy   | `company` columns returned                                                              |
| ---------- | --------------------------------------------------------------------------------------- |
| `'join'`   | `['domain', 'id', 'name']` (allowlist honored, 3 columns)                               |
| `'query'`  | `['createdAt', 'deletedAt', 'description', 'domain', 'id', 'name', 'updatedAt']` (7 columns, allowlist ignored) |

**Practical impact:** if you opt into `'query'` and your controller relies on `JoinOption.allow` to keep relation columns out of the response (e.g., to hide an `internalNotes` or `passwordHash` column on a related entity), set explicit response DTOs via `@Crud({ serialize: { ... } })` on the controller. When using `'query'`, gate sensitive columns behind a serializer instead of the join allowlist.

**Why:** `'query'` issues `SELECT * FROM relation_table WHERE parentId IN (...)` per relation. TypeORM's `setFindOptions` API treats `relations` as a whole-entity load, with no parent context to resolve a parent-aliased computed column or a per-relation column allowlist. This is TypeORM behavior, not a `@nestjs-crud` bug; it is documented here so you know the tradeoff before opting in.

## Other adapters

Drizzle, MikroORM, and Prisma do not expose a `relationLoadStrategy` switch through `@Crud()` in v2.0.0. Each ORM has its own loading semantics:

- **Drizzle** uses explicit `with` in queries; no strategy switch.
- **MikroORM** uses `populate` and `populateWhere`; configure at the `EntityManager` level.
- **Prisma** uses `include` and nested `select`; relation-loading semantics diverge from SQL JOIN. See [ServicePrisma](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma).

A unified relation-loading strategy across all four adapters is a candidate for a later release.

## See also

- TypeORM relation-load-strategy docs: <https://typeorm.io/eager-and-lazy-relations>
- [Caching guide](https://github.com/kodjunkie/nestjs-crud/wiki/Caching)
- [ServiceTypeorm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm)
- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration)
- Source: `packages/core/src/interfaces/query-options.interface.ts` (`relationLoadStrategy` field)
- Source: `packages/typeorm/src/query/typeorm-query-composer.ts` (composer applies the strategy via `setFindOptions`)
