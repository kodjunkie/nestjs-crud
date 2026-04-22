# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A NestJS CRUD monorepo (`@nestjs-crud/core`) that auto-generates RESTful CRUD endpoints for NestJS controllers. Supports TypeORM, MikroORM, and Drizzle ORM. Managed with Yarn workspaces + Lerna + `@zmotivat0r/mrepo`.

## Packages

Six packages in `packages/`, with this dependency chain:

```
util → request → core → typeorm
                      → drizzle
                      → mikro-orm
```

- **`@nestjs-crud/util`** — Tiny type-check utilities (`isNil`, `isArrayFull`, etc.)
- **`@nestjs-crud/request`** — `RequestQueryBuilder` (frontend query construction) and `RequestQueryParser` (backend query parsing). Handles search conditions, filters, joins, sorting, pagination
- **`@nestjs-crud/core`** — Core framework: `@Crud()` decorator, `CrudRoutesFactory`, `CrudRequestInterceptor`, `CrudResponseInterceptor`, `@CrudAuth()`, `@Override()`, `@ParsedRequest()`, `CrudConfigService`
- **`@nestjs-crud/typeorm`** — `TypeOrmCrudService<T>` — concrete TypeORM implementation that translates parsed requests into `SelectQueryBuilder` queries
- **`@nestjs-crud/drizzle`** — `DrizzleCrudService<T>` — Drizzle ORM implementation that translates parsed requests into Drizzle query builder operations
- **`@nestjs-crud/mikro-orm`** — `MikroOrmCrudService<T>` — MikroORM implementation that translates parsed requests into EntityManager operations

## Build Commands

```bash
yarn build          # Build all packages (tsc via mrepo, respects dependency order)
yarn clean          # Remove lib/ dirs and .mrepo cache
yarn rebuild        # clean + build
yarn lint           # ESLint with --fix on all package .ts files
yarn format         # Prettier via pretty-quick
```

TypeScript uses composite project references. Each package compiles `src/` → `lib/`. Path aliases (`@nestjs-crud/*` → `packages/*/src`) are configured in root `tsconfig.json`.

## Testing

Jest 30 + ts-jest + jest-extended. Tests resolve `@nestjs-crud/*` imports directly to source via `moduleNameMapper` (no build needed).

```bash
# Run all tests (requires DB)
yarn test

# Full test with DB setup (drop → sync → seed → test)
yarn test:postgres
yarn test:mysql

# Run a single test file
npx jest packages/core/test/crud.decorator.base.spec.ts

# Run tests matching a name pattern
npx jest --testNamePattern="getManyBase"

# Run MikroORM adapter tests (ESM — needs NODE_OPTIONS)
yarn test:mikro-orm

# Coverage
yarn test:coverage
```

`yarn test:mikro-orm` is the ONLY supported way to run `packages/mikro-orm/test/*.spec.ts`. `@mikro-orm/core` v7 is pure ESM (`import.meta.url`); the script sets `NODE_OPTIONS=--experimental-vm-modules` and points Jest at `packages/mikro-orm/jest.config.js` (ts-jest ESM preset). Invoking `npx jest packages/mikro-orm/test/...` directly will fail with `SyntaxError: Cannot use 'import.meta' outside a module`.

### Test categories

- **`packages/core/test/`** — Unit tests for decorators, interceptors, config service. No database needed.
- **`packages/request/test/`** — Unit tests for query builder/parser. No database needed.
- **`packages/typeorm/test/`** — Integration tests requiring a live database. Tests use the `integration/typeorm/` app as a fixture (entities, services, seeds).

### Database for integration tests

`compose.yml` provides Postgres (port 5455), MySQL (port 3316), and Redis (port 6399):

```bash
docker compose up -d                    # Start all services
yarn db:prepare:typeorm:postgres        # Drop + sync + seed Postgres
yarn db:prepare:typeorm:mysql           # Drop + sync + seed MySQL
```

Set `TYPEORM_CONNECTION=mysql` to run against MySQL instead of the default Postgres.

## Repo Gotchas — Rules That Prevent Real Recurring Mistakes

These have burned me or an executor more than once. Treat as non-negotiable.

- **`.planning/` is gitignored** (see `.gitignore`). `git add .planning/...` silently skips — SUMMARY.md / STATE.md / CONTEXT.md / PLAN.md / VALIDATION.md all live on the filesystem only. Commit source-code changes only. `commit_docs: false` in `.planning/config.json` codifies this — don't flip it.

- **`yarn clean` before `yarn build` when editing core interfaces.** TypeScript composite project refs raise TS5055 when a `lib/` dir already exists for a package whose `src/` just changed. `yarn rebuild` (= clean + build) is the script for this. If a build fails with TS5055, the fix is always `yarn clean && yarn build` — don't chase the error.

- **Never `/g` flag on regex used with `.test()`.** `RegExp` with `/g` carries stateful `lastIndex`, so `.test()` on the same regex against the same input returns different values across calls. This caused v1.0.2 QUALITY-02/03 bugs. If you MUST match globally, use `.match()` or construct a fresh `RegExp` per call — never reuse a `/g` regex with `.test()`.

- **Commit specific files by path, never `git add -A` / `git commit -a`.** The root `package.json` regularly carries unstaged in-progress dep bumps (MikroORM, NestJS minors, typescript-eslint) that belong to separate concerns. A wide `add` bundles them into the wrong commit. Narrow stage → review diff → commit. If your change is in `packages/foo/`, `git add packages/foo/...` — nothing more.

- **ESLint rules that bite when adding classes:**
  - `@typescript-eslint/member-ordering`: fields → constructor → methods; within each, public → protected → private
  - `lines-between-class-members: always` — blank line between EVERY class member (including consecutive private fields)
  - `max-len: 150` — break long signatures / template literals across lines
  - `comma-dangle: always-multiline` — trailing commas on multi-line objects / arrays / params
  - Prettier runs as `pretty-quick` pre-commit hook and will reformat files outside your diff — after committing, `git checkout -- <file>` to unwind unrelated reformats and keep scope tight.

- **Jest `moduleNameMapper` resolves `@nestjs-crud/*` to `packages/*/src`** (root `jest.config.js`). Tests run without `yarn build` — new `src/` files + exports are visible to tests immediately. Do NOT add `yarn build` as a prerequisite to a test-only change.

- **`integration/typeorm/` demo app is known-broken against TypeORM v0.3.x.** `integration/typeorm/auth.guard.ts:12` calls the deleted `findOne(id)` signature. Not in CI matrix. If you need a cold-start smoke, expect `TS2559` — this is pre-existing, not your regression. Fix lands with Phase 6 REFACTOR-01 (decouple integration app from fixture).

- **`.planning/` is the GSD workflow directory.** Phase-based planning artifacts live here (`phases/NN-name/NN-{CONTEXT,RESEARCH,VALIDATION,PLAN,SUMMARY,DISCUSSION-LOG,UAT}.md`). Orchestrated by `/gsd-*` skills (discuss → research → plan → execute → verify). `STATE.md` is the live project state; `ROADMAP.md` defines phases; Known Risks surfaces forward-flagged debt from prior phases. Read the relevant `NN-CONTEXT.md` before touching any file in its scope.

## Architecture

### How `@Crud()` works

The `@Crud()` class decorator instantiates `CrudRoutesFactory` at decoration time (not runtime). The factory:

1. Merges controller options with `CrudConfigService` global defaults
2. Generates 8 route handler methods on the controller prototype (`getManyBase`, `getOneBase`, `createOneBase`, `createManyBase`, `updateOneBase`, `replaceOneBase`, `deleteOneBase`, `recoverOneBase`)
3. Sets NestJS route metadata (`PATH_METADATA`, `METHOD_METADATA`), interceptors, and Swagger decorators
4. Detects `@Override()`-decorated methods and wires them in place of generated routes

### Request lifecycle

```
HTTP Request
  → CrudRequestInterceptor: parse query/params, apply @CrudAuth filter/persist, build SCondition search tree
  → Controller handler (generated or @Override)
  → CrudService (TypeOrmCrudService / DrizzleCrudService / MikroOrmCrudService): build query from parsed request, execute
  → CrudResponseInterceptor: serialize response using class-transformer with per-route DTOs
```

### Key patterns

- **Entity-as-DTO is the default, but dedicated DTOs are also supported**: Most users let `class-validator` groups (`CrudValidationGroups.CREATE` / `UPDATE`) on the entity handle create-vs-update validation. When a stricter API boundary is needed, `@Crud({ dto: { create, update, replace } })` wires separate DTO classes; `@Crud({ serialize: {...} })` wires per-route response DTOs. Don't assume "no DTO classes" — the package supports both patterns. Details in `skills/nestjs-crud/SKILL.md`.
- **Search conditions**: MongoDB-like `SCondition` syntax (`$and`, `$or`, `$eq`, `$gt`, `$cont`, etc.) gets recursively translated to TypeORM `Brackets`/`andWhere`/`orWhere`.
- **`integration/typeorm/`** is both a runnable NestJS app and the test fixture for integration tests. Tests import entities/services from there directly.
- **Metadata-driven**: All route configuration flows through `Reflect.defineMetadata`. The reflection helper `R` (in `packages/core/src/crud/reflection.helper.ts`) centralizes all metadata access. Constants are in `packages/core/src/constants.ts`.
- **Swagger is optional**: `safeRequire` gracefully skips Swagger setup if `@nestjs/swagger` is not installed.
