---
phase: 07-real-db-tests-ci-matrix
plan: "06"
subsystem: ci
tags:
  - ci
  - github-actions
  - devops
  - matrix
dependency_graph:
  requires:
    - 07-01
    - 07-02
    - 07-03
    - 07-04
    - 07-05
  provides:
    - CI-02 (6 parallel matrix jobs per PR)
    - test:parity script
    - test:all umbrella script
  affects:
    - .github/workflows/tests.yml
    - package.json
tech_stack:
  added:
    - GitHub Actions matrix strategy (adapter x db)
  patterns:
    - parity-gate-before-matrix (parity job needs: before 6 DB-bound cells)
    - fail-fast-false (all cells report independently)
key_files:
  created: []
  modified:
    - .github/workflows/tests.yml
    - package.json (scripts block only)
decisions:
  - D-06: parity job runs before matrix jobs (needs: parity) — fail fast on piece-level contract before spinning 6 DB runners
  - D-06b: fail-fast false so engineers see which specific adapter/db cell failed
  - D-06c: legacy test:postgres / test:mysql aliases retained for contributor muscle memory
metrics:
  duration: "~5 minutes"
  completed: "2026-04-22T16:21:09Z"
  tasks_completed: 2
  tasks_total: 3
  files_modified: 2
---

# Phase 7 Plan 06: CI Matrix Rewrite Summary

**One-liner:** GitHub Actions 3×2 matrix (7 jobs: parity + 6 adapter×db cells) with Yarn 4.12.0 pin and per-cell `yarn test:{adapter}:{db}` dispatch.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add test:{adapter}:{db} scripts + test:parity + test:all | e214cb3 | package.json (scripts block) |
| 2 | Rewrite .github/workflows/tests.yml as 3×2 matrix | 420169f | .github/workflows/tests.yml |
| 3 | Human-verify 7 CI jobs green on real PR | — | awaiting human verification |

## Scripts Added (package.json)

| Script | Command |
|--------|---------|
| `test:typeorm:postgres` | `yarn db:prepare:typeorm:postgres && yarn test` |
| `test:typeorm:mysql` | `yarn db:prepare:typeorm:mysql && TYPEORM_CONNECTION=mysql yarn test` |
| `test:drizzle:postgres` | `yarn db:prepare:drizzle:postgres && DRIZZLE_DIALECT=postgres npx jest --config packages/drizzle/jest.config.js` |
| `test:drizzle:mysql` | `yarn db:prepare:drizzle:mysql && DRIZZLE_DIALECT=mysql npx jest --config packages/drizzle/jest.config.js` |
| `test:parity` | `npx jest --config jest.config.js packages/core/test/parity` |
| `test:all` | chains test:parity + all 6 cells sequentially |

Legacy aliases `test:postgres` and `test:mysql` preserved unchanged.

## tests.yml Changes

- **Before:** Single `test` job, ~43 lines, ran `yarn test:coverage` on Postgres only
- **After:** 2-level fan-out — `parity` job + `test` matrix job, ~73 lines

### 7 Jobs Defined

| # | Job | Adapter | DB |
|---|-----|---------|-----|
| 1 | parity | — | — (Docker-free) |
| 2 | test | typeorm | postgres |
| 3 | test | typeorm | mysql |
| 4 | test | drizzle | postgres |
| 5 | test | drizzle | mysql |
| 6 | test | mikro-orm | postgres |
| 7 | test | mikro-orm | mysql |

Key properties:
- `needs: parity` — matrix jobs do not start if parity fails
- `fail-fast: false` — all 6 cells run to completion regardless of individual failures
- Yarn pinned to `4.12.0` in both jobs (regression guard: 4.14.x lockfile format bump broke `--immutable`)
- 30-second DB readiness probe (`wait for DB` step) per matrix cell
- `yarn test:coverage` removed — coverage deferred to Phase 10 (COVERAGE-01)
- `release.yml` untouched (verified: `git diff .github/workflows/release.yml` = empty)

## Local Spot-Check Results

| Command | Result |
|---------|--------|
| `yarn test:parity` | 54/54 passed (3.158s, Docker-free) |
| `yarn test:drizzle:postgres` | requires running Docker — not executed (CI validates) |
| `yarn test:mikro-orm:postgres` | requires running Docker — not executed (CI validates) |

## Human Verification Pending (Task 3)

**Action required:** Push dev branch, open PR to master, confirm 7 jobs appear and all turn green.

Expected GitHub Actions job names:
1. `parity`
2. `test (typeorm, postgres)`
3. `test (typeorm, mysql)`
4. `test (drizzle, postgres)`
5. `test (drizzle, mysql)`
6. `test (mikro-orm, postgres)`
7. `test (mikro-orm, mysql)`

Verification steps:
1. `git push origin dev`
2. Open PR: `dev → master`
3. Wait for Tests workflow dispatch
4. Confirm all 7 jobs green
5. Confirm `release.yml` did NOT trigger
6. Note any flaky cells — file follow-up issue if found

**Resume signal:** Paste PR URL and state "all 7 green" (or describe failures).

## Deviations from Plan

None — plan executed exactly as written. Scripts match plan spec verbatim. tests.yml matches plan template with one cosmetic change: `×` replaced with `x` in the step name `run ${{ matrix.adapter }} x ${{ matrix.db }} tests` (GitHub Actions UI renders unicode inconsistently in job names).

## Known Stubs

None.

## Threat Flags

None — CI infrastructure only, no new production threat surface.

## Self-Check: PASSED

- `e214cb3` exists: confirmed
- `420169f` exists: confirmed
- `.github/workflows/tests.yml` contains `strategy:` matrix block: confirmed
- `package.json` has all 6 `test:{adapter}:{db}` scripts: confirmed (node verification passed)
- `release.yml` untouched: confirmed (git diff = 0 lines)
- 5 drift files remain unstaged: confirmed
