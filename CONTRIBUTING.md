# Contributing to `@nestjs-crud`

Thanks for your interest in contributing. This guide covers local setup, the common development workflows, and conventions this repo follows.

## Branches

- **`master`** — current stable line. v2.0.0 ships here; future v2.x work merges here.
- **`dev`** — active development for the next minor/major.
- **`release/*`** — short-lived cut branches (e.g., `release/v2.0.0`). PR `release/* → master` triggers `.github/workflows/release.yml` which tags + publishes to npm.
- **`v1.0.2`** — preserved patch line. v1.0.3 lands here if a critical v1 bugfix is ever needed; v1 consumers stay on the v1 line by pinning `"@nestjs-crud/<pkg>": "^1.0.2"` in their package.json.

Pick the right branch for your contribution:
- **Bug fix, feature, or breaking change targeting v2.x** → branch off `dev`, target `dev`.
- **Critical v1 bugfix** → branch off `v1.0.2`, target `v1.0.2`.

## Local setup

Prerequisites:
- Node.js >=22.0.0 (enforced via `engines.node` in every package.json — see BUILD-01)
- Yarn (classic, via Corepack or `npm i -g yarn`)
- Docker Desktop (for integration tests against Postgres + MySQL)

```bash
git clone git@github.com:kodjunkie/nestjs-crud.git
cd nestjs-crud
yarn install
```

## Building locally

```bash
yarn build       # Build all packages (tsc -b via mrepo, respects dependency order)
yarn rebuild     # Clean + build (use when lib/ is out of date or stale)
yarn clean       # Remove lib/ dirs and .mrepo cache
```

**If you see TS5055 errors on `yarn build`:** run `yarn rebuild` instead. The repo's composite TypeScript refs can occasionally produce TS5055 when `lib/` outputs are re-read as inputs; `yarn clean && yarn build` always resolves it. As of v1.0.2, root `tsconfig.json` excludes `**/lib` and `**/*.tsbuildinfo` to prevent this in most cases.

## Running tests

Tests run against source via Jest's `moduleNameMapper` — no pre-build required for the typeorm/drizzle/core/request/util packages.

Each adapter has its **own jest.config.js** (Phases 09.1 + 10). The `test:*` scripts route correctly:

```bash
# Fast: unit tests (no DB) — core, request, util only
yarn test

# Per-adapter integration matrices (Docker required)
docker compose up -d                          # Postgres 5455, MySQL 3316, Redis 6399

yarn db:prepare:typeorm:postgres
yarn test:typeorm:postgres                    # TypeORM cell against Postgres

yarn db:prepare:typeorm:mysql
yarn test:typeorm:mysql                       # TypeORM cell against MySQL

yarn db:prepare:drizzle:postgres
yarn test:drizzle:postgres                    # Drizzle cell against Postgres

yarn db:prepare:drizzle:mysql
yarn test:drizzle:mysql                       # Drizzle cell against MySQL

yarn db:prepare:mikro-orm:postgres
yarn test:mikro-orm                           # MikroORM cell — see ESM caveat below

yarn db:prepare:prisma:postgres
yarn test:prisma                              # Prisma cell

yarn test:parity                              # Cross-adapter parity assertions
yarn test:all                                 # Full matrix (8 cells; ~8 min)
yarn test:coverage                            # Coverage report
```

### MikroORM ESM caveat

`yarn test:mikro-orm` is the **only** supported way to run `packages/mikro-orm/test/*.spec.ts`. `@mikro-orm/core` v7 is pure ESM (uses `import.meta.url`); the script sets `NODE_OPTIONS=--experimental-vm-modules` and points Jest at `packages/mikro-orm/jest.config.js` (ts-jest ESM preset). Invoking `npx jest packages/mikro-orm/test/...` directly will fail with `SyntaxError: Cannot use 'import.meta' outside a module`.

### Test fixtures vs examples

- **Test fixtures** live in `packages/{adapter}/test/__fixture__/` — self-contained Nest apps imported by spec files. Not consumer-facing.
- **Runnable demos** live in `examples/` (e.g., `examples/typeorm-demo/`). These ARE consumer-facing reference apps. **Demos must NOT import from `test/`.** This separation prevents the test harness from being load-bearing on a consumer-facing app.

## Code style

ESLint + Prettier are enforced. Key rules (see `eslint.config.mjs` and `.prettierrc.json` for specifics):

- `@typescript-eslint/member-ordering`: fields → constructor → methods; public → protected → private; static first.
- `lines-between-class-members: always` — blank line between every class member.
- `max-len: 150` (comments up to 200).
- `comma-dangle: always-multiline`.
- `singleQuote: true`, `trailingComma: all`.
- Do **not** use the `g` flag on regex consumed by `.test()` — it causes stateful `lastIndex` bugs on repeat calls. Use `/i` or flag-less forms instead.

Auto-fix before committing:

```bash
yarn format    # Prettier via pretty-quick
yarn lint      # ESLint --fix across packages/**/*.ts
```

## Adapter shape

Every adapter service (TypeORM / Drizzle / MikroORM / Prisma) delegates query composition to a `QueryTranslator<Q, W>` facade. The public contract lives in `@nestjs-crud/core`. Each facade composes 3 internal pieces:

- **`WhereBuilder<Q, W>`** — compiles `SCondition` to the ORM's predicate type (`Brackets` for TypeORM, `SQL` for Drizzle, `FilterQuery<T>` for MikroORM, Prisma `where` object for Prisma).
- **`QueryComposer<Q>`** — applies WHERE + sort + pagination + field selection + soft-delete + eager joins to `Q`. The D-05b SQLi guard (`joinResolver.getAllowedColumnsFor` + throwing `onBadRequest`) concentrates here in the sort branch.
- **`FetchHelper<Q>`** — executes prepared queries: `count`, `findOneOrFail`, `executeMany`.

All three pieces are `@internal` — they're exported only via the `@nestjs-crud/core/query` subpath. Consumer-facing code MUST NOT import from this subpath.

**Config-object constructors at every boundary.** Translator + each piece take a single `config` object (`{ entityColumnsHash, entityHasDeleteColumn, onBadRequest, joinResolver, ... }`). No service-locator casts. No backrefs from pieces to services.

**MikroORM em is a thunk, never a captured field.** `MikroOrmFetchHelper` receives `getEm: () => EntityManager` and calls `this.getEm()` fresh per method — never caches. Caching `em` across calls reintroduces cross-request identity-map pollution that MikroORM's request-scope lifecycle is designed to prevent.

When adding a new adapter, follow this exact shape. Cross-reference the existing 4 implementations in `packages/{typeorm,drizzle,mikro-orm,prisma}/src/`.

## Tooling acknowledgement

This monorepo uses [`@zmotivat0r/mrepo`](https://www.npmjs.com/package/@zmotivat0r/mrepo) for build orchestration over Yarn workspaces + Lerna. mrepo respects the package dependency chain (`util → request → core → typeorm/drizzle/mikro-orm/prisma`) and caches build outputs under `.mrepo/`.

A future evaluation of mrepo's stickiness vs. alternatives (Nx, Turborepo, plain tsc -b) is tracked in the project's internal todo list. v2.x ships with mrepo as-is; no migration is planned for the v2.x line.

If `yarn build` fails with TS5055, run `yarn rebuild` (`yarn clean && yarn build`) — see the build section above.

## Commit conventions

This repo uses [Conventional Commits](https://www.conventionalcommits.org/). Scopes match package names or area keywords:

```
<type>(<scope>): <short summary>

<optional body explaining why>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`.
Scopes: `core`, `request`, `util`, `typeorm`, `drizzle`, `mikro-orm`, `docs`, `ci`, `legal`, etc.

Lerna's `--conventional-commits` mode reads these when generating CHANGELOGs, so a clean commit history becomes readable release notes automatically.

In v2.x, Lerna's `--conventional-commits` mode also drives per-package CHANGELOG generation during `lerna version`. Commit scopes like `feat(09-04)` (phase-numbered) work but produce noisy auto-CHANGELOG entries — the root `CHANGELOG.md` is hand-curated on release branches to compensate.

## Pull requests

- One logical change per PR. Keep the diff focused.
- If adding a bugfix, add a regression test. Especially for regex / state / async bugs — repeat-call or concurrent-call tests are what catch the real-world shape.
- If changing a package's public API, target `master` (v2) not `v1.0.2`.
- PR description should include the requirement ID (e.g., `QUALITY-02`, `ARCH-01`) when the change is part of a tracked milestone.

## Questions

Open a discussion or issue. This is a maintained fork of [`@nestjsx/crud`](https://github.com/nestjsx/crud) — see [`NOTICE.md`](NOTICE.md) for attribution and fork history.
