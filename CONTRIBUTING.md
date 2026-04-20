# Contributing to `@nestjs-crud`

Thanks for your interest in contributing. This guide covers local setup, the common development workflows, and conventions this repo follows.

## Branches

- **`v1.0.2`** — current patch release branch. Security + correctness fixes only (strictly non-breaking from `v1.0.1`).
- **`master`** — `v2.0.0` development. Architectural cleanup, breaking changes.

Pick the right branch for your contribution:
- **Bug fix or security patch** → branch off `v1.0.2`, target `v1.0.2`
- **New feature, architectural work, or breaking change** → branch off `master`, target `master`

## Local setup

Prerequisites:
- Node.js 22.x (see `@types/node` version for the floor)
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

Tests run against source via Jest's `moduleNameMapper` — no pre-build required.

```bash
# Fast: unit tests only (no DB)
yarn test

# Full suite with databases (requires Docker)
docker compose up -d                   # Postgres 5455, MySQL 3316, Redis 6399
yarn db:prepare:typeorm:postgres       # Drop + sync + seed Postgres
yarn test:postgres                     # Integration tests against Postgres

yarn db:prepare:typeorm:mysql
yarn test:mysql                        # Integration tests against MySQL

yarn test:coverage                     # Full suite + coverage report
```

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

## Commit conventions

This repo uses [Conventional Commits](https://www.conventionalcommits.org/). Scopes match package names or area keywords:

```
<type>(<scope>): <short summary>

<optional body explaining why>
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `build`, `ci`.
Scopes: `core`, `request`, `util`, `typeorm`, `drizzle`, `mikro-orm`, `docs`, `ci`, `legal`, etc.

Lerna's `--conventional-commits` mode reads these when generating CHANGELOGs, so a clean commit history becomes readable release notes automatically.

## Pull requests

- One logical change per PR. Keep the diff focused.
- If adding a bugfix, add a regression test. Especially for regex / state / async bugs — repeat-call or concurrent-call tests are what catch the real-world shape.
- If changing a package's public API, target `master` (v2) not `v1.0.2`.
- PR description should include the requirement ID (e.g., `QUALITY-02`, `ARCH-01`) when the change is part of a tracked milestone.

## Questions

Open a discussion or issue. This is a maintained fork of [`@nestjsx/crud`](https://github.com/nestjsx/crud) — see [`NOTICE.md`](NOTICE.md) for attribution and fork history.
