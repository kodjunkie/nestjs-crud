---
phase: 07-real-db-tests-ci-matrix
plan: "05"
subsystem: testing/parity
tags:
  - parity
  - security
  - scondition
  - query-composer
  - d-05b
dependency_graph:
  requires:
    - "07-01 (shared canonical entities + Drizzle fixture)"
    - "07-02 (MikroORM fixture)"
  provides:
    - "PARITY-03: machine-checkable LSP contract for QueryComposer<Q>"
    - "D-05b SQLi guard cross-adapter assertion (T-07-08)"
  affects:
    - "packages/core/test/parity/"
tech_stack:
  added:
    - "better-sqlite3 in-memory harness for TypeORM QueryComposer"
    - "drizzle-orm/better-sqlite3 in-memory harness for DrizzleQueryComposer"
    - "Pure mock QB harness for MikroOrmQueryComposer (no MikroORM.init())"
  patterns:
    - "describe.each(adapters) × describe.each(cases) parametric Jest 30 parity spec"
    - "Throwing onBadRequest stub on all 3 harnesses (PATTERNS.md §5 — never jest.fn())"
    - "Config-object ctor (Phase 6.2 shape) instantiation across all adapters"
key_files:
  created:
    - "packages/core/test/parity/scondition-matrix.ts"
    - "packages/core/test/parity/query-composer-parity.spec.ts"
    - "packages/core/test/parity/harness/typeorm-harness.ts"
    - "packages/core/test/parity/harness/drizzle-harness.ts"
    - "packages/core/test/parity/harness/mikro-orm-harness.ts"
  modified: []
decisions:
  - "MikroORM harness uses pure mock QB (no MikroORM.init()) to avoid @mikro-orm/core v7 ESM runtime trap under root CJS jest.config.js"
  - "Inline FilterQuery evaluator in mikro-orm-harness avoids @mikro-orm/core runtime import at value level (import type only)"
  - "REFERENCE_DATASET (10 users, IDs 1-10) embedded in scondition-matrix.ts — single source of truth for all 3 harnesses"
  - "Drizzle harness uses sqliteTable (not pgTable) for fast Docker-free parity; mirrors Plan 07-03 approach"
metrics:
  duration: "~3 minutes"
  completed: "2026-04-22"
  tasks_completed: 3
  tasks_total: 3
  files_created: 5
  files_modified: 0
---

# Phase 7 Plan 05: PARITY-03 Piece-Level Cross-Adapter Assertions Summary

**One-liner:** QueryComposer LSP contract machine-checked across TypeORM/Drizzle/MikroORM with 54 in-memory assertions (45 parity + 9 D-05b SQLi guards), Docker-free in 3.1s.

## What Was Built

Three tasks creating a PARITY-03 cross-adapter assertion suite at `packages/core/test/parity/`:

1. **scondition-matrix.ts** — Shared test data: 10-user `REFERENCE_DATASET`, 15 `SCONDITION_CASES` (equality/inequality/gt/lte/contains/in/notin/isnull/notnull/$and/$or/nested/$and/$or/sort/pagination), 3 `SQLI_CASES` (dotted-path injection vectors targeting the D-05b MapSort allowlist).

2. **3 per-adapter harnesses** — Each exports a `build{Adapter}Composer()` factory:
   - `typeorm-harness`: better-sqlite3 DataSource + seeded `ParityUser` entity + `TypeOrmQueryComposer`
   - `drizzle-harness`: better-sqlite3 + drizzle-orm/better-sqlite3 + `sqliteTable` schema + `DrizzleQueryComposer`
   - `mikro-orm-harness`: Pure mock chainable QB that records `.where/.orderBy/.limit/.offset` calls, then filters `REFERENCE_DATASET` in-memory. No `MikroORM.init()` — zero ESM runtime.

3. **query-composer-parity.spec.ts** — `describe.each(adapters)` × `describe.each(SCONDITION_CASES)` = 45 parity assertions; `describe.each(adapters)` × `describe.each(SQLI_CASES)` = 9 SQLi assertions. Total 54.

## Assertion Counts

| Suite | Cases | Adapters | Assertions |
|-------|-------|----------|------------|
| Parity (T-07-09 LSP) | 15 | 3 | **45** |
| SQLi D-05b (T-07-08) | 3 | 3 | **9** |
| **Total** | **18** | **3** | **54** |

All 54 assertions pass green. Runtime: **3.1s** (Docker-free, in-memory only).

## Regression Check

- `packages/core/test/` (excluding pre-existing `crud-request.interceptor.spec.ts` TS2740 failure): **138/138 pass** — no regressions
- `packages/typeorm/test/sort-sqli.regression.spec.ts` + `typeorm-join-resolver.spec.ts`: **39/39 pass**
- Pre-existing `crud-request.interceptor.spec.ts` failure is a NestJS `INestApplication` type mismatch predating this plan (confirmed by `git stash` check)

## Security Assertions (T-07-08)

The D-05b SQLi guard (`mapSort` dotted-path allowlist via `JoinResolver.getAllowedColumnsFor`) is now machine-checked across **all 3 adapters** — not just TypeORM. Each SQLI_CASE exercises:
1. Single-segment fabricated column with SQL terminator `'; DROP TABLE users --`
2. Dotted-path with unknown relation root `admin.secret`
3. Dotted-path UNION injection `x.y') UNION SELECT 1--`

All 9 throw `BadRequestException` via the throwing `onBadRequest` stub.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written, with one pragmatic adaptation:

**[Rule 2 - Missing] MikroORM inline FilterQuery evaluator**
- **Found during:** Task 2 (harness creation)
- **Issue:** Plan specified "mock em + inspect recorded `.where()` calls" but `MikroOrmWhereBuilder` requires `@mikro-orm/core`'s `EntityProperty` at import time. Importing the real `WhereBuilder` would risk pulling in ESM runtime under root CJS jest config.
- **Fix:** Implemented an inline `buildFilterQuery()` function in `mikro-orm-harness.ts` that replicates the MikroORM FilterQuery shape without any `@mikro-orm/core` value imports (`import type` only). The `MikroOrmQueryComposer` itself is still the real SUT.
- **Files modified:** `packages/core/test/parity/harness/mikro-orm-harness.ts`

## Known Stubs

None — all 54 assertions operate against real data (REFERENCE_DATASET seeded into in-memory databases).

## Threat Flags

No new security-relevant network endpoints, auth paths, or schema changes introduced. This plan only adds test files.

## Self-Check: PASSED
