# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [Unreleased]

### Added

- Cursor pagination support: `RequestQueryParser` parses the `?cursor=<token>` query parameter into `parsed.cursor`. New `setCursor(token)` method on `RequestQueryBuilder` for client-side construction. Mutex check rejects requests that combine `cursor` with `offset` or `page` query parameters (`400 Bad Request`).


## [2.0.0](https://github.com/kodjunkie/nestjs-crud/compare/v1.0.2...v2.0.0) (2026-04-23)

Coordinated v2.0.0 milestone release. See the [root CHANGELOG.md](../../CHANGELOG.md#200--2026-04-23) and the [v2 Migration guide](https://github.com/kodjunkie/nestjs-crud/wiki/v2-Migration) for full breaking-change details.


### Internal

* **engines:** Node `>=22.0.0` enforced.


## [1.0.2](https://github.com/kodjunkie/nestjs-crud/compare/v1.0.1...v1.0.2) (2026-04-20)


### Bug Fixes

* **legal:** restore upstream attribution and refresh branding ([b0b9da6](https://github.com/kodjunkie/nestjs-crud/commit/b0b9da67aee4772e77dfbc7bd76f8aae201a8ee2))
