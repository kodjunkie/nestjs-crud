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

# Coverage
yarn test:coverage
```

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

- **Entities as DTOs**: Entities use `class-validator` groups (`CrudValidationGroups.CREATE` / `UPDATE`) to handle different validation rules for create vs update, avoiding separate DTO classes.
- **Search conditions**: MongoDB-like `SCondition` syntax (`$and`, `$or`, `$eq`, `$gt`, `$cont`, etc.) gets recursively translated to TypeORM `Brackets`/`andWhere`/`orWhere`.
- **`integration/typeorm/`** is both a runnable NestJS app and the test fixture for integration tests. Tests import entities/services from there directly.
- **Metadata-driven**: All route configuration flows through `Reflect.defineMetadata`. The reflection helper `R` (in `packages/core/src/crud/reflection.helper.ts`) centralizes all metadata access. Constants are in `packages/core/src/constants.ts`.
- **Swagger is optional**: `safeRequire` gracefully skips Swagger setup if `@nestjs/swagger` is not installed.
