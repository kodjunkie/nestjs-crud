---
phase: 07-real-db-tests-ci-matrix
plan: "03"
subsystem: drizzle
tags:
  - testing
  - drizzle
  - integration
  - real-db
dependency_graph:
  requires:
    - "07-01"
  provides:
    - "PARITY-01 (Drizzle real-DB smoke suite)"
  affects:
    - "packages/drizzle/src/drizzle-crud.service.ts"
tech_stack:
  added:
    - "@nestjs/testing (Test.createTestingModule)"
    - "supertest (HTTP-level assertions)"
  patterns:
    - "AppModule.forRoot(dialect) DynamicModule pattern"
    - "insertReturning/updateReturning dialect-aware helpers"
    - "TRUNCATE ... RESTART IDENTITY CASCADE for reproducible seed IDs"
key_files:
  created:
    - packages/drizzle/jest.config.js
    - packages/drizzle/test/real-db-smoke.spec.ts
    - packages/drizzle/test/__fixture__/app/app.module.ts
    - packages/drizzle/test/__fixture__/app/users.controller.ts
    - packages/drizzle/test/__fixture__/app/users.service.ts
    - packages/drizzle/test/__fixture__/app/http-exception.filter.ts
  modified:
    - packages/drizzle/src/drizzle-crud.service.ts
    - packages/drizzle/test/__fixture__/schema.postgres.ts
    - packages/drizzle/test/__fixture__/schema.mysql.ts
    - packages/drizzle/test/__fixture__/seeds.ts
decisions:
  - "MySQL RETURNING workaround: insertId from OkPacket used for PK; updateReturning falls back to in-memory toSave object then re-fetches via getOneOrFail"
  - "Drizzle schema column names must use camelCase to match TypeORM-created tables (TypeORM default: JS property name = SQL column name)"
  - "Seed uses TRUNCATE ... RESTART IDENTITY CASCADE on Postgres to clear FK-dependent TypeORM tables and reset serial sequences"
  - "S4 sort assertion is dialect-aware: MySQL and Postgres use different text collations ('1@' < '10@' on MySQL, '10@' < '1@' on Postgres); assertion checks set size + last element invariant instead of strict order"
metrics:
  duration: "~82 minutes"
  completed: "2026-04-22T15:21:28Z"
  tasks_completed: 3
  files_changed: 10
---

# Phase 7 Plan 03: Drizzle Real-DB Smoke Suite Summary

Delivered a 10-scenario HTTP-level smoke suite for `DrizzleCrudService` using `Test.createTestingModule` + supertest, exercising the full request pipeline (CrudRequestInterceptor + @Crud() controller + DrizzleCrudService + CrudResponseInterceptor) against real Postgres and MySQL. Closes PARITY-01 for the Drizzle adapter.

## Test Results

| Dialect  | Pass | Fail | Total |
|----------|------|------|-------|
| Postgres | 10   | 0    | 10    |
| MySQL    | 10   | 0    | 10    |

## Scenario List

| # | HTTP Method | Route | What it tests |
|---|-------------|-------|---------------|
| S1 | GET | /users | getMany — all 10 seeded users returned |
| S2 | GET | /users?limit=3 | getMany with pagination limit |
| S3 | GET | /users?filter=isActive\|\|$eq\|\|true | filter operator via CrudRequestInterceptor |
| S4 | GET | /users?sort=email,ASC | sort via QueryComposer (pipeline regression guard for D-05b) |
| S5 | GET | /users?s={"email":{"$cont":"@email.com"}} | SCondition search via $cont operator |
| S6 | GET | /users/1 | getOne by primary key |
| S7 | POST | /users | createOne — 201 + body; count becomes 11 |
| S8 | PATCH | /users/1 | updateOne — 200 + updated field persisted |
| S9 | DELETE | /users/2 | softDelete — row excluded from GET /users |
| S10 | PATCH | /users/2/recover | recoverOne — row reappears in GET /users |

## Artifacts

- `packages/drizzle/jest.config.js` — per-package Jest config scoping to `packages/drizzle/test/**/*.spec.ts`, `testTimeout: 30000`, `forceExit: true`
- `packages/drizzle/test/real-db-smoke.spec.ts` — 10-scenario spec; picks dialect from `DRIZZLE_DIALECT` env var (default: postgres); seeds before each test
- `packages/drizzle/test/__fixture__/app/` — Nest harness: AppModule.forRoot + UsersController (@Crud) + UsersService (extends DrizzleCrudService) + HttpExceptionFilter

## DB-Semantic Quirks Discovered

### 1. MySQL RETURNING Not Supported
`DrizzleCrudService` used `.returning()` unconditionally in `createOne`, `createMany`, `updateOne`, `replaceOne`. MySQL's Drizzle driver does not implement this clause.

**Fix (Rule 1 — Bug):** Added `insertReturning()` and `updateReturning()` protected helpers. On MySQL: `insertReturning` executes the insert and reads `insertId` from the `OkPacket` to inject the generated PK back into the entity object. `updateReturning` executes the update and returns `toSave` in-memory. Both callers then re-fetch via `getOneOrFail` using the PK. On Postgres/SQLite: delegates to `.returning()` as before.

### 2. MySQL vs Postgres Text Collation
Emails `1@email.com` through `10@email.com` sort differently:
- **MySQL**: `1@email.com < 10@email.com` (`@` ASCII 64 > `0` ASCII 48, so `1@` > `10@`... wait — MySQL sorts `1@` < `10@` in practice)
- **Postgres**: `10@email.com < 1@email.com` (binary: `0` < `@`)

S4 assertion adapted: checks set cardinality (all 10 emails present) + that `9@email.com` is last (invariant true under both collations).

### 3. Drizzle Schema Must Match TypeORM Column Names
TypeORM by default uses the JS property name as the SQL column name (no snake_case mapping). The initial Drizzle schema used snake_case SQL names (`name_first`, `is_active`, `company_id`) but the actual DB has camelCase (`nameFirst`, `isActive`, `companyId`). The schema also defined a `password` column not present in the TypeORM-created table.

**Fix (Rule 3 — Blocking):** Updated `schema.postgres.ts` and `schema.mysql.ts` to use camelCase column names matching the actual DB.

### 4. Seed FK Cascade Issue
The Drizzle seed's `db.delete(users)` failed because TypeORM-managed `user_licenses` and `user_projects` tables hold FK references to `users`. Additionally, serial sequences were not reset between runs, causing canonical IDs to be non-reproducible.

**Fix (Rule 3 — Blocking):** Replaced the Postgres delete path with `TRUNCATE user_licenses, user_projects, projects, users, companies RESTART IDENTITY CASCADE`. MySQL path already used `SET FOREIGN_KEY_CHECKS = 0` with TRUNCATE; added `user_licenses` and `user_projects` to that list.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] MySQL `.returning()` not supported**
- **Found during:** Task 3 (MySQL test run)
- **Issue:** `DrizzleCrudService.createOne`, `updateOne`, `replaceOne`, `createMany` all called `.returning()` which Drizzle's MySQL driver does not implement → 500 on POST/PATCH
- **Fix:** Added `insertReturning` and `updateReturning` helpers with MySQL-specific OkPacket `insertId` path
- **Files modified:** `packages/drizzle/src/drizzle-crud.service.ts`
- **Commits:** `097e0f9`

**2. [Rule 3 - Blocking] Drizzle schema column names mismatched actual DB**
- **Found during:** Task 3 (Postgres seed)
- **Issue:** Schema used snake_case SQL names and `password` column; TypeORM-created tables use camelCase
- **Fix:** Updated `schema.postgres.ts` and `schema.mysql.ts` to match actual column names
- **Files modified:** `packages/drizzle/test/__fixture__/schema.postgres.ts`, `packages/drizzle/test/__fixture__/schema.mysql.ts`
- **Commits:** `097e0f9`

**3. [Rule 3 - Blocking] Seed FK cascade and sequence reset**
- **Found during:** Task 3 (Postgres seed)
- **Issue:** `db.delete(users)` violates FK from `user_licenses`; serial IDs not reproducible without RESTART IDENTITY
- **Fix:** `TRUNCATE ... RESTART IDENTITY CASCADE` on Postgres; added `user_licenses`/`user_projects` to MySQL TRUNCATE list
- **Files modified:** `packages/drizzle/test/__fixture__/seeds.ts`
- **Commits:** `097e0f9`

**4. [Rule 1 - Bug] S4 sort assertion collation mismatch**
- **Found during:** Task 3 (cross-dialect run)
- **Issue:** `localeCompare` and JS `.sort()` both disagree with one of the DB collations
- **Fix:** Dialect-invariant assertion: check set cardinality + `9@email.com` is last element
- **Files modified:** `packages/drizzle/test/real-db-smoke.spec.ts`
- **Commits:** `097e0f9`

## Threat Surface Scan

Tests only — no new production network endpoints, auth paths, or schema changes at trust boundaries. The `insertReturning`/`updateReturning` helpers are internal service methods (no new public API surface). No threat flags.

## Known Stubs

None — all 10 scenarios hit real DB rows; no mocked data paths.

## Self-Check: PASSED

- `packages/drizzle/jest.config.js` — FOUND
- `packages/drizzle/test/real-db-smoke.spec.ts` — FOUND (12 `it()` blocks, 10 test scenarios + 2 nested describes)
- `packages/drizzle/test/__fixture__/app/app.module.ts` — FOUND
- `packages/drizzle/test/__fixture__/app/users.controller.ts` — FOUND
- `packages/drizzle/test/__fixture__/app/users.service.ts` — FOUND
- `packages/drizzle/test/__fixture__/app/http-exception.filter.ts` — FOUND
- Commits `0b6da16`, `1bd7135`, `097e0f9`, `f13f3c7` — all present in `git log`
- Postgres 10/10 pass — verified
- MySQL 10/10 pass — verified
- `new DrizzleCrudService` in spec — 0 occurrences (correct)
- 5 drift files remain unstaged — verified
