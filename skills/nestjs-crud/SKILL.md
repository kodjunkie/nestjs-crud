---
name: nestjs-crud
description: Use when working with @nestjs-crud packages — adding features to TypeORM, Drizzle, or MikroORM adapters, running integration tests, fixing ESLint violations, debugging build errors, or releasing a new version.
---

# @nestjs-crud

## Package Dependency Chain

```
util → request → core → typeorm
                      → drizzle
                      → mikro-orm
```

All packages at `packages/{name}/`, source in `src/`, compiled to `lib/`.
Orchestrated by `@zmotivat0r/mrepo` + Lerna 9 + Yarn 4.12.0 workspaces.

## Build Commands

| Command | What |
|---------|------|
| `yarn build` | Build all (tsc via mrepo, respects dep order) |
| `yarn clean` | Remove `lib/` dirs + `.mrepo` cache |
| `yarn rebuild` | `clean` then `build` — use for fresh builds |

**Gotcha:** `yarn build && yarn build` works since root `tsconfig.json` excludes `**/lib` and `**/*.tsbuildinfo`. If TS5055 appears, run `yarn rebuild`.

**`removeComments: false`** — intentionally set so `@deprecated` JSDoc propagates into emitted `.d.ts` files. Do not change to `true`.

Tests run against source via `moduleNameMapper` — **no build needed for tests**.

## Test Infrastructure

```bash
yarn test                          # Unit tests only (no DB)
yarn test:postgres                 # Integration: Postgres 5455
yarn test:mysql                    # Integration: MySQL 3316
yarn test:coverage                 # Full suite + coverage

# DB prep (required before integration tests)
docker compose up -d
yarn db:prepare:typeorm:postgres
yarn db:prepare:typeorm:mysql
```

- Jest 30 + ts-jest 29.4.6 + jest-extended
- `@nestjs-crud/*` resolves to source via `tsconfig.jest.json` `moduleNameMapper`
- Docker ports: Postgres **5455**, MySQL **3316**, Redis **6399**

## ESLint Rules — Critical

Violations block CI. Apply these in every source/test edit:

| Rule | What it means |
|------|--------------|
| `member-ordering` | fields → constructor → methods; public → protected → private; static first |
| `lines-between-class-members: always` | Blank line between **every** class member |
| `max-len: 150` | Per line (comments 200) |
| `comma-dangle: always-multiline` | Trailing commas in all multi-line structures |
| **No `/g` on `.test()`** | `/gi` or `/g` on a regex used with `.test()` causes stateful `lastIndex` — alternating true/false on repeat calls with the same input. Use `/i` only. |

Run `yarn lint` to auto-fix ESLint issues.

## Key Gotchas

**SQL-injection guards** — each adapter has a `protected sqlInjectionRegEx: RegExp[]` denylist. Entries must use `/i`, never `/gi` or `/g`. Test seed copies in spec files must match production in lockstep or regression tests prove nothing.

**Drizzle `protected db: any`** — `DrizzleCrudService` constructor takes an untyped `any` db. `skipLibCheck: true` in `packages/drizzle/tsconfig.json` suppresses drizzle-orm type issues. This is a known v2 fix (TYPES-01).

**`integration/typeorm/`** is both the runnable demo app and the test fixture. Tests use alphabetic prefixes (`a.`, `b.`, `c.`) to enforce execution order. Assertion counts (e.g., `data.length === 9`) are load-bearing seed values.

**`git push origin v1.0.2` is ambiguous** — both a branch and a tag exist with that name. Use explicit refs:
- Branch: `git push origin refs/heads/v1.0.2`
- Tag: `git push origin refs/tags/v1.0.2`

**`lerna publish` adds `gitHead`** to each `package.json` — discard this, never commit.

**CHANGELOG.md in tarballs** — npm does NOT auto-include it despite docs. Each package's `files` array must explicitly list `"CHANGELOG.md"`.

## Release Flow (v1.0.3+)

`release.yml` triggers on **merged PR where head branch starts with `release/`** — NOT on tag push.

```bash
# 1. Create release branch from v1.0.2
git checkout -b release/v1.0.3
git push -u origin release/v1.0.3

# 2. Open PR: release/v1.0.3 → v1.0.2 (NOT master)
gh pr create --base v1.0.2 --head release/v1.0.3 \
  --title "chore(release): publish 1.0.3" \
  --notes-file CHANGELOG.md

# 3. Merge → release.yml fires automatically:
#    runs tests → creates tag → lerna publish → GH release
```

**Before Lerna version bump:**
1. Run `npx lerna version X.Y.Z --conventional-commits --no-push --no-git-tag-version --yes`
2. Hand-curate the generated root `CHANGELOG.md` (Lerna produces a commit dump; replace with thematic sections)
3. Commit Lerna output and curation as **separate commits** — root CHANGELOG must be curated AFTER Lerna runs, not before (Lerna overwrites it)

**Yarn pin:** Both `tests.yml` and `release.yml` pin `yarn set version 4.12.0`. Yarn 4.14+ changed lockfile format (version 8 → 9), breaking `--immutable` installs.

## v2 Context

Work happens on `master`. `v1.0.2` branch preserved as stable line.

**ARCH-01..05** is the core v2 work:
- Extract `QueryTranslator<T>` (ends 3-way code drift across adapters)
- Slim 1023-line `typeorm-crud.service.ts` to orchestration only
- Align Drizzle + MikroORM to same pattern

**`@deprecated` surfaces in v1.0.2 pointing at v2:**
- `DrizzleCrudService.db` → v2 TYPES-01 (typed db client)
- `MikroOrmCrudService` class + `protected metadata: any` → v2 TYPES-02
- `ParamOption.enum` (internal Swagger import) → v2 TYPES-05

**SEC-03:** `updateOne`, `replaceOne`, `deleteOne` in all 3 adapters use read-modify-write without transactions — real race window under concurrent requests. Fix deferred to v2 ARCH-04.

**Migration guide URL:** `https://github.com/kodjunkie/nestjs-crud/wiki/v2-migration` (placeholder — populate when v2 starts).
