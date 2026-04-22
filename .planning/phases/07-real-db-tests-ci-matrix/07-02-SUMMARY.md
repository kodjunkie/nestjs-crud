---
phase: 07-real-db-tests-ci-matrix
plan: "02"
subsystem: testing/mikro-orm-fixture
tags:
  - testing
  - mikro-orm
  - fixture
dependency_graph:
  requires:
    - packages/core/test/__shared-fixture__/canonical-entities.ts (Plan 07-01)
  provides:
    - packages/mikro-orm/test/__fixture__/entities/company.entity.ts
    - packages/mikro-orm/test/__fixture__/entities/user.entity.ts
    - packages/mikro-orm/test/__fixture__/entities/project.entity.ts
    - packages/mikro-orm/test/__fixture__/entities/index.ts
    - packages/mikro-orm/test/__fixture__/mikro-orm.postgres.config.ts
    - packages/mikro-orm/test/__fixture__/mikro-orm.mysql.config.ts
    - packages/mikro-orm/test/__fixture__/seeds.ts
  affects:
    - package.json (4 new scripts + @mikro-orm/postgresql and @mikro-orm/mysql added)
    - yarn.lock (new packages resolved)
tech_stack:
  added:
    - "@mikro-orm/postgresql@^7.0.0 (defineConfig for Postgres adapter)"
    - "@mikro-orm/mysql@^7.0.0 (defineConfig for MySQL adapter)"
    - "@mikro-orm/core@^7.0.0 (version range updated from ^6.0.0)"
    - "@mikro-orm/sqlite@^7.0.0 (version range updated from ^6.0.0)"
  patterns:
    - MikroORM @Entity decorated classes mirroring canonical shape with snake_case fieldName mappings
    - ESM import.meta.url CLI entry (not require.main) for seed script
    - getEm thunk never cached — seeds fork em fresh per seedAll call
    - refreshDatabase() = drop + create in MikroORM v7
key_files:
  created:
    - packages/mikro-orm/test/__fixture__/entities/company.entity.ts
    - packages/mikro-orm/test/__fixture__/entities/user.entity.ts
    - packages/mikro-orm/test/__fixture__/entities/project.entity.ts
    - packages/mikro-orm/test/__fixture__/entities/index.ts
    - packages/mikro-orm/test/__fixture__/mikro-orm.postgres.config.ts
    - packages/mikro-orm/test/__fixture__/mikro-orm.mysql.config.ts
    - packages/mikro-orm/test/__fixture__/seeds.ts
  modified:
    - package.json (4 script insertions + mikro-orm version range updates)
    - yarn.lock (new @mikro-orm/postgresql and @mikro-orm/mysql packages)
decisions:
  - "@mikro-orm/postgresql and @mikro-orm/mysql installed at ^7.0.0 to match @mikro-orm/core v7.0.11 already in use"
  - "@mikro-orm/knex stays at ^6.0.0 — no stable v7 release exists; v7-only dev versions are not suitable"
  - "Company.users and Company.projects use string-based OneToMany targets to avoid circular import issues at load time"
  - "package.json core/sqlite ranges updated from ^6.0.0 to ^7.0.0 to match actual installed version and prevent v6 downgrade on future yarn install"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-22"
  tasks_completed: 3
  files_created: 7
  files_modified: 2
---

# Phase 7 Plan 02: MikroORM Fixture Summary

**One-liner:** MikroORM @Entity classes (Company/User/Project) with snake_case fieldName mappings + Postgres/MySQL defineConfig + ESM seedAll CLI consuming canonical seed arrays, plus 4 root scripts with NODE_OPTIONS=--experimental-vm-modules.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create 3 MikroORM entities + barrel index | 66b1fe4 | entities/company.entity.ts, user.entity.ts, project.entity.ts, index.ts |
| 2 | Create Postgres/MySQL configs + seed CLI | bc3c021 | mikro-orm.postgres.config.ts, mikro-orm.mysql.config.ts, seeds.ts |
| 3 | Add 4 root package.json scripts | 0320d14 | package.json, yarn.lock |

## Acceptance Criteria Results

| Criterion | Result |
|-----------|--------|
| 3 @Entity classes exist with correct tableName | PASS |
| email @Unique in user.entity.ts | PASS |
| snake_case fieldNames (name_first, name_last, company_id, profile_id, deleted_at) | PASS |
| No top-level require() in any entity/fixture file | PASS |
| port: 5455 in postgres config | PASS |
| port: 3316 in mysql config | PASS |
| refreshDatabase() in seeds.ts | PASS |
| import.meta.url CLI entry in seeds.ts | PASS |
| 4 scripts present with NODE_OPTIONS=--experimental-vm-modules | PASS |
| test:mikro-orm:* target packages/mikro-orm/jest.config.js | PASS |
| test:mikro-orm:* set MIKRO_ORM_DIALECT env | PASS |
| Existing test:mikro-orm script unchanged | PASS |
| yarn test:mikro-orm still 82/82 green | PASS |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] @mikro-orm/postgresql and @mikro-orm/mysql not installed**

- **Found during:** Pre-task analysis
- **Issue:** `@mikro-orm/postgresql` and `@mikro-orm/mysql` were absent from node_modules; plan template uses `defineConfig` from these packages. `yarn add` initially resolved `@mikro-orm/core` to v6.6.13 (downgrading from v7.0.11) because root package.json had `"^6.0.0"` for core/knex/sqlite.
- **Fix:** Updated package.json version ranges for `@mikro-orm/core` and `@mikro-orm/sqlite` to `^7.0.0`; kept `@mikro-orm/knex` at `^6.0.0` (no stable v7 release exists); ran `yarn install` to resolve core back to v7.0.11 with postgresql/mysql v7.0.11.
- **Files modified:** `package.json`, `yarn.lock`
- **Commit:** `0320d14`

**2. [Rule 2 - Style] Prettier reformatted entity files at pre-commit**

- **Found during:** Task 1 commit hook
- **Issue:** Prettier removed blank lines between class members that ESLint `lines-between-class-members: always` expects. The pre-commit hook ran prettier before ESLint, so the final committed state has no blank lines between members (prettier wins over ESLint rule in the project's hook order).
- **Fix:** Accepted the linter's output; re-staged reformatted entities in Task 2 commit.
- **Files modified:** `entities/company.entity.ts`, `entities/project.entity.ts`, `entities/user.entity.ts`
- **Commit:** `bc3c021`

## Known Stubs

None — all fixture files are complete and functional. The `seedAll` export is wired to real data.

## Threat Flags

None — no new production threat surface. Test-only files; ports 5455/3316 are compose-only non-standard ports; credentials are compose-local only.

## Self-Check: PASSED
