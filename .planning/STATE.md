---
gsd_state_version: 1.0
milestone: v2.0.0
milestone_name: milestone
status: unknown
last_updated: "2026-04-22T15:22:29.148Z"
progress:
  total_phases: 15
  completed_phases: 7
  total_plans: 42
  completed_plans: 41
  percent: 98
---

# STATE

**Last Updated:** 2026-04-22 — Phase 5 (ARCH-04) complete; reviewer approved 2026-04-22.

## Project Reference

See: `.planning/PROJECT.md` (updated 2026-04-21)

**Core value:** Multi-ORM CRUD library — trustworthy, maintainable, fully typed, with Prisma adapter.
**Current focus:** Phase --phase — 07

## Current Milestone

**v2.0.0 — Architectural Cleanup & Breaking Fixes**

Decomposes 1023-line `typeorm-crud.service.ts` into shared `QueryTranslator<Q,W>` core, aligns all 3 existing adapters, tightens public types, adds real-DB integration tests, and ships Prisma adapter. One coordinated breaking release.

## Branch Strategy

- **`dev`** — all v2 development happens here
- **`release/v2.0.0`** — created when v2 is ready to ship; PR → `master` triggers `release.yml`
- **`master`** — receives v2 on merge; the stable production line going forward
- **`v1.0.2`** — preserved as stable patch line; v1.0.3 bugfixes land here if needed

## Status

| Artifact | Status |
|----------|--------|
| v1.0.2 shipped | ✓ All 6 packages on npm; GitHub Release v1.0.2 |
| `.planning/PROJECT.md` | ✓ Updated for v2.0.0 milestone |
| `.planning/REQUIREMENTS.md` | ✓ v2 requirements active; TYPES-06 permanently out of scope |
| `.planning/ROADMAP.md` | ✓ Phases 3-11 defined |
| `.planning/research/` | ✓ 4 research files (ARCHITECTURE, FEATURES, STACK, PITFALLS) |
| Phase 3 planning | Not started |

## Active Phase

**Phase 6 COMPLETE — 12/12 plans.** ARCH-05 alignment + REFACTOR-01 decouple both sealed 2026-04-22. Triple-green gate: Postgres 602/602, MySQL 602/602, MikroORM standalone 80/80. Adapter line deltas: Drizzle 598 → 384 (−214, −35.8%), MikroORM 536 → 340 (−196, −36.6%), TypeORM 249 held. `QueryTranslator.count()` shared across all 3 adapters. `integration/typeorm/` removed; `examples/typeorm-demo/` is canonical demo. D-05b SQLi specs ported to Drizzle + MikroORM. SEC-03 breadcrumbs in TypeORM + MikroORM (Drizzle pending Phase 8).

**Phase 5 COMPLETE — 8/8 plans (01, 02, 03, 04, 05, 06, 06.5, 07).** ARCH-04 hard gate met: `TypeOrmCrudService` slimmed from 472 → 249 lines (≤250 gate). Reviewer approval 2026-04-22. COVERAGE-01 partial — 9 of 14 service pragmas deleted; 5 preserved (Phase 10 scope).

**Next:** Phase 7 (PARITY-01/02/03 + CI-02 — real-DB integration matrix for Drizzle + MikroORM).

## v2.0.0 Phase Backlog (Phases 3-11)

3. **ARCH-01** — QueryTranslator<Q,W> interface + TypeORM reference (foundation; strict prerequisite for 4+5)
4. **ARCH-02 + ARCH-03** (parallel) — JoinResolver extraction + InputSanitizer with column allowlist
5. **ARCH-04** — Slim TypeOrmCrudService to ~200-line orchestrator; tackle 33 istanbul-ignore pragmas
6. **ARCH-05 + REFACTOR-01** — Align Drizzle/MikroORM to same pattern; decouple integration/typeorm/ fixture
7. **PARITY-01/02/03 + CI-02** — Real-DB integration tests for Drizzle/MikroORM; CI matrix
8. **TYPES-01..05 + OBS-01 + SEC-02/03 + BUILD-01** — Breaking type fixes, logger injection, security
9. **ADAPTER-01** — Prisma adapter (spike joins first; builds on ARCH-01 shared interfaces)
10. **PERF-01/02 + CI-03 + COVERAGE-01** — Split-query joins, cache docs, Swagger-less CI, coverage floor
11. **DOCS-01/03/04/07 + RELEASE** — Migration guide, Wiki, package READMEs, publish v2.0.0

## Key Research Findings for Planning

- `QueryTranslator<Q, W>` needs 2 type params (builder + predicate) — single param leaks ORM types into core
- ARCH-01 → ARCH-04 is strict sequential; ARCH-02 + ARCH-03 can run in parallel
- ARCH-05 safe migration: delegation wrappers on protected methods, mark `@deprecated` for v3
- Prisma joins highest-risk — `include`/nested-`select` ≠ SQL JOIN; spike required in Phase 9
- SEC-03 per-adapter: TypeORM needs QueryRunner repos, Drizzle must shadow `this.db`, MikroORM has request-scope concern
- CHANGELOG risk: pre-conventional-commit history on `master` — dry-run `lerna version` before v2 tag
- TYPES-06 (remove skipLibCheck) permanently deferred — drizzle-orm v0.45.1 has 50+ internal type errors

## Known Risks

- ARCH-03 allowlist is behaviorally breaking — fields passing old denylist may now throw; needs prominent migration guide entry. **Hard-breaking as of commit `7cb3534` — no opt-out flag ships in v2.0** (the `strictSanitization` opt-out was removed post-Phase-4 because shipping a security kill-switch contradicts `security-validate-all-input`). Phase 11 DOCS-04 MUST emphasize the audit requirement: consumers must ensure every field passed through `sort=`/`search=`/`filter=` is in `entityColumnsHash`, or is an explicitly-joined relation. Typical breakages: `@VirtualColumn`, `@Formula`, client aliases for joined subquery results, dotted paths like `profile.name` when `profile` isn't in `join=`.
- Istanbul ignore pragmas: 7 safe, 13 need fixture tests, 13 structurally hard — Phase 5 is large
- Prisma `createMany` returns `{ count }` only — looped `$transaction` + `create` needed for full record return
- Pre-v2 commit history produces noise in CHANGELOG — run `lerna version --dry-run` before tagging
- **Phase 3 structural debt — MUST be resolved in Phase 5 (ARCH-04).** Phase 5's CONTEXT.md MUST surface these three cleanup items as locked scope:
  1. **Service-locator coupling.** `TypeOrmQueryTranslator` reaches into `TypeOrmCrudService` private state via `(this.service as unknown as { ... })` casts for `entityColumnsHash` and `throwBadRequestException` (lines 67, 444, 449, 454 of `packages/typeorm/src/typeorm-query-translator.ts`). Fix: inject only the minimal surface — `new TypeOrmQueryTranslator(repo, { entityColumnsHash, onBadRequest })`. Remove all `as unknown as` casts.
  2. **`applyToQuery` is under-implemented.** Interface JSDoc promises WHERE + sort + pagination + field selection + soft-delete; implementation only applies WHERE (pass-through at lines 42-50). The service's `createBuilder` bypasses `applyToQuery` and calls `translator.buildWhere(...)` directly (lines 272, 389 of `packages/typeorm/src/typeorm-crud.service.ts`). Phase 5 must move sort/pagination/field-selection/soft-delete into `applyToQuery` and wire the service to call only `applyToQuery`.
  3. **Circular-import shape.** `typeorm-query-translator.ts` uses `import type { TypeOrmCrudService }` to break the runtime cycle. Structural co-dependence — any future value-import from the service would reintroduce the cycle. Resolved naturally by fix #1 (removing the service backref).
- **Pre-existing `integration/typeorm/` demo app breakage.** `integration/typeorm/auth.guard.ts:12` calls `this.usersService.findOne(1)` against TypeORM v0.3's `findOne(options)` signature — raises `TS2559` on boot. Not in CI matrix, not a Phase 3 regression (file untouched by all Phase 3 commits), but blocks cold-start smoke testing of any translator via HTTP. Migrate when `integration/typeorm/` gets decoupled from the test fixture (Phase 6 REFACTOR-01) or sooner if ergonomics bite. Fix: `findOne({ where: { id: 1 } })` or `findOneBy({ id: 1 })`.
- **Phase 4 items for Phase 5 CONTEXT.md to surface:**
  1. **`mapSort` asserts RAW user field, not alias-prefixed output of `getFieldWithAlias`.** Changed in commit `31d2edf` to fix 26 integration-test regressions caused by the allowlist migration. Relation-qualified dotted paths (e.g., `projects.name`) effectively bypass strict allowlist because the raw field doesn't match `entityColumnsHash`. Plan 04 SUMMARY.md flagged this as intentional but worth re-examining when Phase 5's ARCH-04 slims the service further — either tighten the allowlist to include resolved dotted paths, or formalize "relation-qualified paths are a separate security scope."
  2. **JoinResolver: nested-join without parent seeded throws a low-level TypeORM error, not a silent no-op.** Discovered by Plan 02's 34-case unit spec (commit `3c5d317`). Current `getRelationMetadata` swallows ANY error with `catch → return null`; Plan 02 shows one code path where the error surfaces before the catch. Pinned as-is per D-05 verbatim-port directive. Phase 5 COVERAGE-01 should replace the silent-null swallow with structured error handling (the `TODO(COVERAGE-01)` comment in `packages/typeorm/src/typeorm-join-resolver.ts` already flags the location).
  3. **A2 fallback is gone.** The per-service `strictSanitization` override that would have deferred to v2.1 was removed alongside the opt-out (commit `7cb3534`). No v2.1 type-surface-only residue to clean up — Phase 5/6/7 can ignore this item entirely.

## Evolution Triggers

- After each phase completes → update Active Phase here, mark requirements in REQUIREMENTS.md
- If scope changes → update PROJECT.md Key Decisions + this file
- When v2.0.0 ships → update branch strategy, archive phase dirs, start next milestone planning

**Phase 7 Progress:** Plan 07-03 complete 2026-04-22T15:21:28Z. Drizzle real-DB smoke 10/10 Postgres + 10/10 MySQL. PARITY-01 closed. MySQL RETURNING limitation fixed in DrizzleCrudService. Schema column-name alignment (camelCase) + seed FK cascade resolved.

**Planned Phase:** 7 (real-db-tests-ci-matrix) — 6 plans — 2026-04-22T14:32:48.632Z

**Phase 6 COMPLETE:** 2026-04-22. 12/12 plans executed. Triple-green gate: Postgres 602/602, MySQL 602/602, MikroORM 80/80. Drizzle service −214 lines; MikroORM service −196 lines. `integration/typeorm/` deleted (Plan 10 move; Plan 12 verification). `examples/typeorm-demo/` canonical demo (Plan 11, reviewer approved). DOCS-04 forward-flag list consolidated in `06-12-SUMMARY.md` for Phase 11 migration guide.

**Phase 5 COMPLETE:** 2026-04-22. 8/8 plans executed. Service: 472 → 249 lines. Cross-DB 629/629 Postgres + MySQL. Pragma count: 14 → 5. Commits: `9f3e1aa`, `a61faf6`, `9a9be85`, `6c9e4f9`, `0724f19`, `17970b7`, `1c6b4c7`, `c2baf1c`, `894d4f0`, `bbb6ff3`, `c10bbbc`, `87f6ff2`, `78b0a54`, `4ca8f48`, `e2e6783`. DOCS-04 forward-flags consolidated in `05-07-SUMMARY.md`.

**Phase 3 Progress:** 2/4 plans complete (03-01 interfaces scaffolding; 03-02 lift getAllowedColumns). Next: 03-03.

**Phase 4 Wave 1 Progress:** Plans 00, 01, 02 complete. Wave 1 finished — review checkpoint pauses before Wave 2.

- 04-00: Ground-rules / planning artifacts.
- 04-01: `TypeOrmJoinResolver` extracted from `TypeOrmCrudService` (verbatim port, 210 lines, exported from `@nestjs-crud/typeorm`). Commits `753af6f`, `0181161`, `6da4974`, `7cc5c4c`.
- 04-02: 34-case unit spec for `TypeOrmJoinResolver` shipped (~2s, in-memory SQLite). Commit `3c5d317`.

**Phase 4 Wave 2 Progress:**

- 04-03: `InputSanitizer` interface + concrete class + `DEFAULT_SQL_INJECTION_REGEX` shipped in `@nestjs-crud/core`; `strictSanitization` config surface on `CrudGlobalConfig` (runtime, default `true`) and `CrudOptions` (type-surface only). A2 risk hit — per-service override wire DEFERRED to v2.1 (global config is sole runtime source in v2.0). Commits `d2cc7c5`, `87336b9`. Core unit suite 70/70 green.
- 04-04: Three-adapter InputSanitizer migration — `checkSqlInjection`/`sqlInjectionRegEx` DELETED from all 3 adapter services. `InputSanitizer` instantiated in each ctor after `onInitMapEntityColumns()`. `resolveStrictSanitization()` helper lifted to `CrudService` abstract base (global-only per A2). All 5 callsites use `.assert()`. Commits `31d2edf`, `6762ce9`. 619/619 real integration tests green on Postgres + MySQL; 3 legacy unit spec files failing (Plan 05 scope). TypeORM mapSort callsite deviated from plan prescription (Rule 1 bug fix — assert raw field, bypass strict-mode for dotted paths) — documented in SUMMARY §Deviations.
- 04-05: InputSanitizer unit spec (26 cases, Nyquist matrix) shipped at `packages/core/test/input-sanitizer.spec.ts`; 3 legacy adapter specs rewritten (`checkSqlInjection`/`sqlInjectionRegEx` references — zero remaining); MikroORM source-scanning parity test deleted (obsolete — DEFAULT_SQL_INJECTION_REGEX is now SSOT); TypeORM spec gains strictSanitization opt-out config coverage. Commits `61d1adc`, `63f7327`. **Phase 4 gate: 680/680 integration on Postgres + MySQL.** Wave 2 SUMMARY ships DOCS-04 forward-flag (behavior change + opt-out paths + before/after + v3 timeline) for Phase 11 Wiki migration guide. **Phase 4 COMPLETE — 6/6 plans.**

## Decisions (Phase 5)

- D-03a: `TypeOrmQueryTranslator` ctor retrofitted to config-object (breaking): `(repo, { entityColumnsHash, onBadRequest, getAllowedColumnsFor })`. Removes all `as unknown as` service-locator casts. Commit `6c9e4f9`.
- D-03b: `QueryTranslator.applyToQuery` JSDoc expanded to reflect full contract (WHERE + sort + pagination + field-selection + soft-delete). Commit `0724f19`.
- D-04: Pragma audit rule — delete unreachable, preserve legitimately-untestable, NO structured-reason comments (Phase 10 scope). 2 deleted in Plan 07; 7 deleted via code lifts in Plans 03–06.5; 5 preserved.
- D-05b: SQLi regression vector (dotted-path sort) closed via `mapSort` raw-field allowlist + regression spec. Plans 01 (RED), 03 (GREEN flip). Re-affirmed by 629/629 Postgres + MySQL in Plan 07.
- `findOneOrFail` lifted to translator (Plan 06.5); `prepareEntityBeforeSave` + `getSelect` lifted to `@nestjs-crud/core` pure utils (Plans 05, 06). Service becomes a 249-line orchestrator.

## Decisions (Phase 3)

- D-05: `getAllowedColumns` lifted to `CrudService` abstract base — single source of truth across TypeORM, Drizzle, MikroORM adapters (2026-04-21, commit `e3c5793`).
- D-05a: Pre-lift three-adapter byte-equivalence audit gate executed and passed; verdict EQUIVALENT (istanbul pragmas intentionally dropped on base).
- D-05b: All three adapter copies of `getAllowedColumns` deleted post-lift; callsites resolve via inheritance.
