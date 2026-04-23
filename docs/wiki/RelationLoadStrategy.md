# Relation load strategy

`@nestjs-crud/typeorm` exposes TypeORM's `relationLoadStrategy` choice through the `@Crud({ query: { relationLoadStrategy } })` option (new in v2.0.0). This page covers when to use each strategy, the divergence in alias-select behavior under `'query'`, and the N+1 / Cartesian-explosion tradeoffs.

## TL;DR

- **Default (`'join'`):** single SQL with `LEFT JOIN`s per relation. Fast for shallow reads. **Cartesian explosion risk** when a single parent has multiple `OneToMany` relations.
- **Opt-in (`'query'`):** separate `SELECT` per relation. Avoids Cartesian. **Trades one query for N small queries.** Custom field aliases (e.g., subquery-derived columns) and relation-level `JoinOption.allow` filters do NOT carry through — see "Alias-select divergence" below.

## Why this matters: avoiding the N+1 / Cartesian dilemma

Relational loading has two failure modes:

1. **N+1 queries.** Read a parent row, then issue one query per child relation per parent — death by a thousand round-trips.
2. **Cartesian explosion.** Single SQL with `LEFT JOIN` against multiple `OneToMany` relations multiplies row counts (parent × children₁ × children₂...). 100 parents × 10 comments × 10 tags = 10,000 rows for what should be 100 reads.

`'join'` avoids N+1 by issuing one query, at the cost of Cartesian explosion when relations fan out. `'query'` avoids Cartesian by issuing one query per relation, at the cost of N small queries (NOT true N+1 — each relation is one query, not one per parent row).

> N+1 isn't *always* worse than one big JOIN — when relations fan out (1→many→many), the JOIN multiplies parent rows by the cross-product of child counts, inflating bytes-on-the-wire and hurting pagination. Split queries trade per-request round-trips for linear-row payload. Pick by query shape, not by reflex.

**Rule of thumb:** prefer `'join'` for `ManyToOne` / `OneToOne` / shallow `OneToMany`; prefer `'query'` when reading multiple `OneToMany` relations on the same parent.

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

The strategy applies to all eager-loaded relations on the controller's read endpoints (`getManyBase`, `getOneBase`).

## Configuring per-request

Consumers can override per-request via the `?relationLoadStrategy=` query param (when allowed by the controller's `@Crud` options):

```
GET /users?join=posts,comments&relationLoadStrategy=query
```

If the controller doesn't allow per-request override, the query param is ignored.

## Alias-select divergence (`'query'` strategy)

When a request includes `fields=` selecting columns from joined relations, the two strategies diverge — a known limitation surfaced by the integration spec (`packages/typeorm/test/perf-01-relation-load-strategy.spec.ts`):

- Under `'join'`, the joined columns become aliased columns in the single SQL output (`"posts_title": "..."`). The composer's `getSelect` honors `?fields=` for top-level columns, and `JoinOption.allow` constrains relation columns at SQL-generation time.
- Under `'query'`, TypeORM's `setFindOptions` REPLACES the SELECT clause and drives column selection from `relations` only. `?fields=` is effectively dropped on top-level columns (only the primary key is guaranteed), and `JoinOption.allow` is **ignored** — the entire relation row is loaded.

**Concrete example** (against a `User → company` relation with `allow: ['name', 'domain']`):

| Strategy   | `company` columns returned                                                              |
| ---------- | --------------------------------------------------------------------------------------- |
| `'join'`   | `['domain', 'id', 'name']` (allowlist honored — 3 columns)                              |
| `'query'`  | `['createdAt', 'deletedAt', 'description', 'domain', 'id', 'name', 'updatedAt']` (7 columns — allowlist ignored) |

**Practical impact:** if you opt into `'query'` AND your controller relies on `JoinOption.allow` to prevent over-fetching relation columns (e.g., to avoid leaking `internalNotes` or `passwordHash` columns from a related entity), set explicit response DTOs via `@Crud({ serialize: { ... } })` on the controller. Plain column selects work in their own way; the safe-by-default approach is to gate sensitive columns behind a serializer, not the join allowlist, when using `'query'`.

**Why:** `'query'` strategy issues `SELECT * FROM relation_table WHERE parentId IN (...)` per relation — TypeORM's `setFindOptions` API treats `relations` as a whole-entity load, with no parent context to resolve a parent-aliased computed column or a per-relation column-allowlist. This is a TypeORM behavior, not a `@nestjs-crud` bug; documented here so consumers know the tradeoff before opting in.

## Other adapters

Drizzle, MikroORM, and Prisma do NOT expose a `relationLoadStrategy` switch through `@Crud()` in v2.0.0. Each ORM has its own loading semantics:

- **Drizzle:** uses explicit `with` in queries; no strategy switch.
- **MikroORM:** has `populate` + `populateWhere`; configure at the `EntityManager` level.
- **Prisma:** uses `include` + nested `select`; relation loading semantics diverge from SQL JOIN — see [ServicePrisma](https://github.com/kodjunkie/nestjs-crud/wiki/ServicePrisma).

A unified relation-loading strategy across all 4 adapters is tracked as a v2.x / v3 forward-flag.

## See also

- TypeORM relation-load-strategy docs: <https://typeorm.io/eager-and-lazy-relations>
- [Caching guide](https://github.com/kodjunkie/nestjs-crud/wiki/Caching)
- [ServiceTypeorm](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm)
- [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration)
- Source: `packages/core/src/interfaces/query-options.interface.ts` (`relationLoadStrategy` field)
- Source: `packages/typeorm/src/query/typeorm-query-composer.ts` (composer applies the strategy via `setFindOptions`)
