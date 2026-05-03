# NOTICE

## Stand With Ukraine

[![Stand With Ukraine](https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/banner2-direct.svg)](https://vshymanskyy.github.io/StandWithUkraine/)

Banner inherited from the upstream project.

---

## About This Fork

This project (`@nestjs-crud/*`) is a fork of [`@nestjsx/crud`](https://github.com/nestjsx/crud), which was authored by Michael Yali and a community of contributors under the MIT License.

The fork was created at upstream version `5.0.0-alpha.3`. Substantial portions of the codebase — including the `@Crud()` decorator pattern, the `SCondition` search DSL, the `RequestQueryBuilder` / `RequestQueryParser`, the metadata-driven routing via `CrudRoutesFactory`, the TypeORM adapter shape, and the eight generated CRUD handlers — derive from upstream work and remain subject to the original MIT copyright.

## Upstream

- **Project:** [`@nestjsx/crud`](https://github.com/nestjsx/crud)
- **Original author:** [Michael Yali](https://twitter.com/MichaelYali) (`mihon4ik@gmail.com`)
- **Original contributors:** [nestjsx/crud contributors](https://github.com/nestjsx/crud/graphs/contributors)
- **Original license:** MIT (see `LICENSE`, first copyright line)

## This Fork

- **Project:** [`@nestjs-crud`](https://github.com/kodjunkie/nestjs-crud)
- **Maintainer:** Lawrence Onah (`paplow01@gmail.com`)
- **License:** MIT (preserves the upstream copyright alongside the maintainer's)

## Scope of Changes in This Fork

This fork adds / modifies (non-exhaustive):

- **Drizzle ORM adapter** (`@nestjs-crud/drizzle`) — new
- **MikroORM adapter** (`@nestjs-crud/mikro-orm`) — new
- **NestJS v11** compatibility and dependency modernization
- **TypeScript 5.x** composite project refs (`tsc -b`) via Yarn 4 workspaces + Lerna 9
- **Jest 30** migration
- Correctness fixes, test coverage expansion, and documentation refresh

Future milestones (including a planned v2.0.0 architectural cleanup) will continue to preserve upstream attribution in this file and in `LICENSE`, regardless of how much upstream code is rewritten or replaced.

## Why This File Exists

The MIT license requires that the original copyright notice and permission notice be retained in all copies or substantial portions of the software. `LICENSE` carries both copyright lines (upstream + fork maintainer). This `NOTICE.md` records the fork's origin in a human-readable place so that future contributors and users can understand the provenance of the code they are using.

If you are considering forking this project in turn, please retain both copyright notices in your `LICENSE` and add your own alongside.
