---
phase: 07-real-db-tests-ci-matrix
plan: "01"
subsystem: testing/drizzle-fixture
tags:
  - testing
  - drizzle
  - fixture
dependency_graph:
  requires: []
  provides:
    - packages/core/test/__shared-fixture__/canonical-entities.ts
    - packages/drizzle/test/__fixture__/schema.postgres.ts
    - packages/drizzle/test/__fixture__/schema.mysql.ts
    - packages/drizzle/test/__fixture__/db.postgres.ts
    - packages/drizzle/test/__fixture__/db.mysql.ts
    - packages/drizzle/test/__fixture__/seeds.ts
  affects:
    - package.json (2 new db:prepare scripts)
tech_stack:
  added:
    - drizzle-orm/pg-core (pgTable, serial, varchar, integer, boolean, timestamp)
    - drizzle-orm/mysql-core (mysqlTable, int, varchar, boolean, datetime)
    - drizzle-orm/node-postgres (drizzle factory for pg Pool)
    - drizzle-orm/mysql2 (drizzle factory for mysql2 pool)
  patterns:
    - Pure TS interfaces for shared canonical entity shape (no runtime cross-package imports)
    - Per-adapter schema decoration of shared shape
    - CLI entry (require.main === module) in seeds.ts for npx ts-node invocation
key_files:
  created:
    - packages/core/test/__shared-fixture__/canonical-entities.ts
    - packages/drizzle/test/__fixture__/schema.postgres.ts
    - packages/drizzle/test/__fixture__/schema.mysql.ts
    - packages/drizzle/test/__fixture__/db.postgres.ts
    - packages/drizzle/test/__fixture__/db.mysql.ts
    - packages/drizzle/test/__fixture__/seeds.ts
  modified:
    - package.json (2 script insertions only)
decisions:
  - "Shared canonical entities stored in packages/core/test/__shared-fixture__/ (per D-03: shape in core, per-adapter decoration in adapter package)"
  - "seeds.ts uses relative path ../../../core/test/__shared-fixture__/canonical-entities to avoid any cross-package runtime dependency"
  - "MySQL TRUNCATE approach for reset (not DELETE) to reset auto-increment counters correctly"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-22T14:51:05Z"
  tasks_completed: 3
  files_created: 6
  files_modified: 1
---

# Phase 7 Plan 01: Shared Fixture + Drizzle Fixture Summary

**One-liner:** Pure TS canonical entity interfaces in core/test + Drizzle pgTable/mysqlTable schema builders + pg/mysql2 db factories + seedAll CLI entry for db:prepare:drizzle:{postgres,mysql} scripts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create shared canonical entity types module | bb888f7 | packages/core/test/__shared-fixture__/canonical-entities.ts |
| 2 | Create Drizzle per-package fixture (schema + seeds + db factories) | a73d32a | schema.postgres.ts, schema.mysql.ts, db.postgres.ts, db.mysql.ts, seeds.ts |
| 3 | Add db:prepare:drizzle:{postgres,mysql} scripts to root package.json | f224b52 | package.json |

## Shared Fixture Module

**Path:** `packages/core/test/__shared-fixture__/canonical-entities.ts`

Exports:
- `CanonicalUser` — id, email, password, nameFirst, nameLast, isActive, companyId, profileId, deletedAt
- `CanonicalCompany` — id, name, domain, description
- `CanonicalProject` — id, name, description, companyId, isActive
- `CANONICAL_SEED_COMPANIES` — 10 companies (Name1..Name10)
- `CANONICAL_SEED_USERS` — 10 users (1@email.com..10@email.com, all companyId: 1)
- `CANONICAL_SEED_PROJECTS` — 10 projects (Project1..Project10, companyIds: 1-5)

Zero runtime imports from any `@nestjs-crud/*` package. Pure TypeScript only.

## Drizzle Fixture Files

| File | Contents |
|------|---------|
| `schema.postgres.ts` | `pgTable` definitions: companies, users, projects with FKs + `timestamp` soft-delete |
| `schema.mysql.ts` | `mysqlTable` equivalents with `datetime` soft-delete |
| `db.postgres.ts` | `Pool` → `drizzle(pool, { schema })` factory on `localhost:5455` |
| `db.mysql.ts` | `mysql2/promise` `createPool` → `drizzle` factory on `localhost:3316` |
| `seeds.ts` | `seedAll(db, dialect)` — deletes child→parent, inserts canonical seed data; CLI entry via `require.main` |

## Row Counts Seeded Per Dialect

| Table | Count |
|-------|-------|
| companies | 10 |
| users | 10 |
| projects | 10 |

Same counts for both Postgres and MySQL dialects.

## Verification of No Runtime Cross-Package Imports

`packages/core/test/__shared-fixture__/canonical-entities.ts` contains zero imports — it is a pure interface/constant module. The canonical-entities file is only imported by `packages/drizzle/test/__fixture__/seeds.ts` via relative path (`../../../core/test/__shared-fixture__/canonical-entities`), which is a test-time file-level import, not a package-level runtime import.

## Root Scripts Added

```json
"db:prepare:drizzle:postgres": "npx ts-node -T --project packages/drizzle/tsconfig.json packages/drizzle/test/__fixture__/seeds.ts postgres",
"db:prepare:drizzle:mysql": "npx ts-node -T --project packages/drizzle/tsconfig.json packages/drizzle/test/__fixture__/seeds.ts mysql"
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All fixture files are fully wired with real seed data.

## Self-Check: PASSED

- [x] `packages/core/test/__shared-fixture__/canonical-entities.ts` exists
- [x] `packages/drizzle/test/__fixture__/schema.postgres.ts` exists (contains `pgTable`)
- [x] `packages/drizzle/test/__fixture__/schema.mysql.ts` exists (contains `mysqlTable`)
- [x] `packages/drizzle/test/__fixture__/db.postgres.ts` exists (contains `5455`)
- [x] `packages/drizzle/test/__fixture__/db.mysql.ts` exists (contains `3316`)
- [x] `packages/drizzle/test/__fixture__/seeds.ts` exists (contains `canonical-entities` import)
- [x] `package.json` scripts `db:prepare:drizzle:postgres` and `db:prepare:drizzle:mysql` present
- [x] Commits bb888f7, a73d32a, f224b52 exist
- [x] `grep -c "^export interface Canonical" canonical-entities.ts` = 3
- [x] `grep -c "CANONICAL_SEED_" canonical-entities.ts` = 3
- [x] Zero `@nestjs-crud/*` imports in canonical-entities.ts
