# Changelog

All notable changes to this project will be documented in this file.
See the [per-package CHANGELOGs](packages/) for adapter-specific history.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

---

## [1.0.2] — 2026-04-21

**Milestone:** Security & Release Readiness — lean, strictly non-breaking patch release.
**Branch:** `v1.0.2` · **Previous:** `v1.0.1`

Upgrading from 1.0.1 requires **no consumer code changes**.

```
yarn up @nestjs-crud/*
# or
npm update @nestjs-crud/util @nestjs-crud/request @nestjs-crud/core \
           @nestjs-crud/typeorm @nestjs-crud/drizzle @nestjs-crud/mikro-orm
```

### Legal

- Upstream MIT attribution restored: `LICENSE` now preserves Michael Yali's 2018-Present copyright alongside the fork maintainer's. `NOTICE.md` added documenting fork origin (`@nestjsx/crud` at `5.0.0-alpha.3`). `contributors` arrays added to the four upstream-derived packages (`util`, `request`, `core`, `typeorm`). Sibling-consistency fix to `@nestjs-crud/mikro-orm` package manifest.

### Correctness

- **`@nestjs-crud/util`** — Removed `/g` flag from `isDateString` regex (`packages/util/src/checks.util.ts`). The flag caused stateful `.test()` `lastIndex` alternation: consecutive calls with the same input returned alternating `true`/`false`. Regression test added (three calls with the same literal verifies idempotence).

- **`@nestjs-crud/typeorm`** — Removed `/g` → `/i` flag from all four `sqlInjectionRegEx` entries (`packages/typeorm/src/typeorm-crud.service.ts`). Same `lastIndex` class of bug. The in-test regex seed at `a.typeorm-crud-service.spec.ts:9-14` updated in lockstep so regression tests prove what they claim. Repeat-call regression test added.

- **`@nestjs-crud/mikro-orm`** — Audited `sqlInjectionRegEx` at `packages/mikro-orm/src/mikro-orm-crud.service.ts`: already at parity with the Drizzle adapter (`/i`, not `/gi`). No source change; source-file inspection test added; parity comment added.

### Ergonomics

- Root `tsconfig.json` now excludes `**/lib` and `**/*.tsbuildinfo` from the TypeScript input set. This prevents TS5055 errors on back-to-back `yarn build` runs (composite project outputs were being re-read as inputs). `yarn build && yarn build` now succeeds without `yarn clean` in between. `yarn rebuild` remains documented in `CONTRIBUTING.md` for edge cases.

- `CONTRIBUTING.md` added — covers branch strategy, local setup, build commands, test commands, commit conventions (Conventional Commits → feeds Lerna CHANGELOG generation), and the `/g`-flag-on-`.test()` avoidance rule.

### CI

- `.github/workflows/tests.yml` pinned to Yarn 4.12.0 (previously `yarn set version stable` resolved to 4.14.1 whose lockfile format `version: 9` was incompatible with the repo's `yarn.lock` `version: 8`, causing `--immutable` install failures on every CI run). `packageManager: "yarn@4.12.0"` added to root `package.json` for Corepack users.

### Forward-looking (v2.0 deprecation signals)

The following surfaces carry `@deprecated` JSDoc annotations in v1.0.2, visible in consumer IDEs and in the emitted `.d.ts` declaration files. **No runtime change.** These signals give consumers months of lead time before v2.0 ships its breaking changes.

- `DrizzleCrudService` — constructor's `db: any` parameter will require a typed Drizzle client in v2 (v2 `TYPES-01`).
- `MikroOrmCrudService` — class-level: public method signatures and internal `any` surfaces will tighten in v2 (v2 `TYPES-02`). Field-level: `protected metadata: any` will become a typed `EntityMetadata` reference.
- `@nestjs-crud/core` — `ParamOption.enum` is typed against `@nestjs/swagger`'s internal import path; v2 will switch to the public Swagger type export (v2 `TYPES-05`).

Migration guide (placeholder — will be authored when v2 planning begins):
https://github.com/kodjunkie/nestjs-crud/wiki/v2-migration

---

## [1.0.1]

See the [v1.0.1 release](https://github.com/kodjunkie/nestjs-crud/releases/tag/v1.0.1).

---

[Unreleased]: https://github.com/kodjunkie/nestjs-crud/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/kodjunkie/nestjs-crud/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/kodjunkie/nestjs-crud/releases/tag/v1.0.1
