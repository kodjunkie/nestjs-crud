# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A NestJS CRUD monorepo (`@nestjs-crud/core`) that auto-generates RESTful CRUD endpoints for NestJS controllers. Supports TypeORM, Drizzle, MikroORM, and Prisma. Managed with Yarn workspaces + Lerna + `@zmotivat0r/mrepo`.

## Packages

Authoritative list lives at `ls packages/` and `lerna.json`'s `packages` glob — do not trust hardcoded counts in docs. Current dependency chain:

```
util → request → core → typeorm
                      → drizzle
                      → mikro-orm
                      → prisma
```

- **`@nestjs-crud/util`** — Tiny type-check utilities (`isNil`, `isArrayFull`, etc.)
- **`@nestjs-crud/request`** — `RequestQueryBuilder` (frontend query construction) and `RequestQueryParser` (backend query parsing). Handles search conditions, filters, joins, sorting, pagination
- **`@nestjs-crud/core`** — Core framework: `@Crud()` decorator, `CrudRoutesFactory`, `CrudRequestInterceptor`, `CrudResponseInterceptor`, `@CrudAuth()`, `@Override()`, `@ParsedRequest()`, `CrudConfigService`, `CrudCacheNotConfiguredError`
- **`@nestjs-crud/typeorm`** — `TypeOrmCrudService<T>` — translates parsed requests into `SelectQueryBuilder` queries
- **`@nestjs-crud/drizzle`** — `DrizzleCrudService<T>` — translates parsed requests into Drizzle query builder operations
- **`@nestjs-crud/mikro-orm`** — `MikroOrmCrudService<T>` — translates parsed requests into EntityManager operations
- **`@nestjs-crud/prisma`** — `PrismaCrudService<T>` — translates parsed requests into PrismaClient operations

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
# Run a single test file via root config (core/request/util specs only)
npx jest packages/core/test/crud.decorator.base.spec.ts

# Run tests matching a name pattern
npx jest --testNamePattern="getManyBase"

# Per-adapter integration tests (must use the scoped scripts — see rule below)
yarn test:typeorm:postgres   yarn test:typeorm:mysql
yarn test:drizzle:postgres   yarn test:drizzle:mysql
yarn test:mikro-orm:postgres yarn test:mikro-orm:mysql
yarn test:prisma:postgres    yarn test:prisma:mysql

# Aggregator (parity + all 8 adapter cells)
yarn test:all
yarn test:parity   # cross-adapter parity specs only
yarn test:coverage # coverage report
```

**Per-adapter test scoping rule.** Each adapter has its own `packages/<adapter>/jest.config.js` with `testMatch` scoped to that package's `test/`. Adapter integration runs MUST go through `yarn test:<adapter>:<db>` — those scripts invoke `jest --config packages/<adapter>/jest.config.js`, NOT root `yarn test`. Running root `yarn test` against an adapter package mixes ESM/CJS specs and pulls in non-target adapter specs (the failure mode that triggered the per-package configs in the first place). Coverage thresholds are enforced per-package via `coverageThreshold` blocks.

**MikroORM ESM caveat.** `yarn test:mikro-orm` (and `:postgres`/`:mysql` variants) is the ONLY supported way to run `packages/mikro-orm/test/*.spec.ts`. `@mikro-orm/core` v7 is pure ESM (`import.meta.url`); the script sets `NODE_OPTIONS=--experimental-vm-modules` and points Jest at `packages/mikro-orm/jest.config.js` (ts-jest ESM preset). Invoking `npx jest packages/mikro-orm/test/...` directly will fail with `SyntaxError: Cannot use 'import.meta' outside a module`.

**MikroORM seed CLIs use `tsx`, not `ts-node --esm`.** `db:prepare:mikro-orm:*` runs via `npx tsx` for ESM-native `.ts` execution without the `NODE_OPTIONS` dance. Don't switch the seed CLIs back to `ts-node --esm` — the jest test runs (which DO need `--experimental-vm-modules`) and the seed CLIs (which don't) are intentionally separate.

### Test categories

- **`packages/core/test/`** — Unit tests for decorators, interceptors, config service. No database needed.
- **`packages/request/test/`** — Unit tests for query builder/parser. No database needed.
- **`packages/typeorm/test/`** — Integration tests requiring a live database. Tests use `packages/typeorm/test/__fixture__/app/` as the fixture — a self-contained NestJS app (entities, modules, services, seeds, ORM configs) imported directly by the spec files.

Rule: **test fixtures live in the package they test (`packages/{adapter}/test/__fixture__/`); runnable demos live in `examples/`** (e.g., `examples/typeorm-demo/`). The demo must not import from `test/`. This separation keeps the test harness from being load-bearing on a consumer-facing app, and gives consumers a standalone reference they can point at.

### Database for integration tests

`compose.yml` provides Postgres (port 5455), MySQL (port 3316), and Redis (port 6399):

```bash
docker compose up -d                    # Start all services
yarn db:prepare:typeorm:postgres        # Drop + sync + seed Postgres
yarn db:prepare:typeorm:mysql           # Drop + sync + seed MySQL
```

Set `TYPEORM_CONNECTION=mysql` to run against MySQL instead of the default Postgres.

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
- **Adapter shape**: every adapter service delegates composition to a `QueryTranslator<Q, W>` facade (public contract in `@nestjs-crud/core`); each facade in turn composes 3 internal pieces — `WhereBuilder<Q, W>` (compiles `SCondition` to the ORM's predicate type), `QueryComposer<Q>` (applies WHERE + sort + pagination + field selection + soft-delete + eager joins to `Q`), and `FetchHelper<Q>` (executes prepared queries: `count`, `findOneOrFail`, `executeMany`). Pieces are `@internal`, exported only via `@nestjs-crud/core/query` subpath. A new adapter follows this exact shape.
- **Config-object ctors at every boundary**: translator and each piece take a single `config` object (`{ entityColumnsHash, entityHasDeleteColumn, onBadRequest, joinResolver, ... }`) — no service-locator casts, no backrefs from pieces to services. The D-05b SQLi guard (`joinResolver.getAllowedColumnsFor` + throwing `onBadRequest`) concentrates in `QueryComposer`'s sort branch.
- **MikroORM em is a thunk, never a captured field**: `MikroOrmFetchHelper` receives `getEm: () => EntityManager` and calls `this.getEm()` fresh per method — never caches it. Caching `em` across calls reintroduces cross-request identity-map pollution that MikroORM's request-scope lifecycle is designed to prevent. Applies to any future MikroORM subclass or helper.
- **Metadata-driven**: All route configuration flows through `Reflect.defineMetadata`. The reflection helper `R` (in `packages/core/src/crud/reflection.helper.ts`) centralizes all metadata access. Constants are in `packages/core/src/constants.ts`.
- **Swagger is optional**: `safeRequire` gracefully skips Swagger setup if `@nestjs/swagger` is not installed.
- **Adapter feature parity is NOT a guarantee.** When adding a feature to one adapter, audit the other 3 explicitly — current asymmetries: `@Crud({ query: { cache } })` is honored only by TypeORM (silently no-ops on Drizzle/MikroORM/Prisma; throws `CrudCacheNotConfiguredError` on TypeORM if `DataSource.cache` is missing); `relationLoadStrategy: 'query'` is TypeORM-only and bypasses `JoinOption.allow` column constraints; the optional logger is a separate ctor arg on TypeORM/Drizzle/MikroORM but a `serviceConfig.logger` field on Prisma (surface differs; default-instantiation behavior is unified across all 4 — `new Logger(<ServiceName>)` when omitted). New features that "should be universal" need per-adapter implementations OR an explicit "TypeORM-only" caveat in docs.
- **Read source before writing example code.** README usage blocks, fixture controllers, wiki pages, and migration examples all become wrong fast if authored from memory or stale plan templates. Before writing a `super(...)` call, an `extends FooCrudService<T>` example, or a method-call sample, open the actual `*-crud.service.ts` ctor + a known-good fixture (`packages/<adapter>/test/__fixture__/app/users.service.ts`) and copy from real working code. Plan templates that describe APIs in English without source-anchoring routinely drift; treat them as starting points, not source of truth.

## Documentation hygiene

- **Internal-tracker IDs do not belong in shipped surfaces.** Whatever scheme an author uses to track work locally (phase numbers, decision IDs, threat IDs, requirement IDs, plan slugs, commit-hash citations) MUST NOT appear in: root `CHANGELOG.md`, per-package `CHANGELOG.md` files (they ship to npm as `files: ["lib","CHANGELOG.md"]`), `docs/wiki/*.md` (auto-syncs to GitHub Wiki on master push), `packages/*/README.md`, source JSDoc comments (root tsconfig has `removeComments: false` — JSDoc survives compilation into `.d.ts`), or `skills/*/SKILL.md`. When writing user-facing docs, describe the change in English ("strict field allowlist", "Node 22+ enforced") — never with a tracker label readers can't decode.
- **Peer-deps drift cascades.** When bumping a dev dep version (e.g., `@nestjs/common` 10 → 11), also audit the corresponding `peerDependencies` range in every package's `package.json`. The two are NOT auto-linked. Mismatches ship to consumers as silent peer-warning noise (or as broken installs when `--immutable`); audit gate sits at root `npm view`/`yarn` install before tagging a release.
- **Behavior-change propagation.** Any observable behavior change (default value, error class/shape, ctor/method signature, peer range, response text, emitted metadata) lives in multiple surfaces: source + root `CHANGELOG.md` + affected per-package `CHANGELOG.md` + `docs/wiki/*.md` + affected `skills/*/SKILL.md` + the `Key patterns` list in this file. Before editing: `grep -rn "<old value>"` to enumerate every mention, then update all hits in one coordinated pass. Partial updates ship contradictory mental models — humans and agents find stale text in one surface and current text in another, then cite the wrong one. The same rule applies when reverting: if you roll back a behavior, grep and roll back every surface.

## Dependency management

- **Install new deps unversioned.** Use `yarn add <pkg>`, not `yarn add <pkg>@X.Y.Z`. Lockfile handles reproducibility; the `package.json` range lets Dependabot/Renovate surface upgrades. Pinning at install time inherits whatever was "latest" that day — the codebase then carries that stale line until a breaking migration forces an upgrade. Exception: security advisory, pre-release, or compat lock. Existing-range edits (e.g., `^5.22.0` → `^7.8.0`) don't apply.

## Release discipline

- **Preserve PR head ref when CI workflows filter by branch prefix.** `release.yml` triggers on merged PRs where `github.event.pull_request.head.ref` starts with `release/`. GitHub's default squash-merge strips the head ref from the merge event, silently bypassing the trigger — the PR merges green, no release workflow runs, no packages publish, no tag is cut, and no error surfaces until someone notices npm is stale. Use `gh pr merge --merge` (true merge commit) for any PR whose head branch participates in a workflow trigger contract; squash remains fine elsewhere. Same rule applies to any future `head.ref`-filtered workflow. Recovery from a squashed release PR is manual: cut the tag locally, `gh workflow run release.yml`, verify OIDC publish, reconcile `lerna.json` state.
