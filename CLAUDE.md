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
