<h1 align="center">
  <img src="img/logo.svg" alt="nestjs-crud" height="56" />
</h1>
<p align="center"><strong>RESTful APIs for NestJS — from a single <code>@Crud()</code> decorator</strong></p>

<br />

<div align="center">

[![npm version](https://img.shields.io/npm/v/@nestjs-crud/core.svg)](https://www.npmjs.com/package/@nestjs-crud/core)
[![CI](https://github.com/kodjunkie/nestjs-crud/actions/workflows/tests.yml/badge.svg)](https://github.com/kodjunkie/nestjs-crud/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

<br />

> This project is a fork of [`@nestjsx/crud`](https://github.com/nestjsx/crud) at upstream version `5.0.0-alpha.3`. See [`NOTICE.md`](NOTICE.md) for attribution and fork history.

Works with **TypeORM**, **Drizzle**, and **MikroORM**.

## Features

<img align="right" src="img/crud-usage.png" alt="CRUD usage" width="400" />

- :electric_plug: Full-featured controllers and services, ready to use
- :octopus: DB- and service-agnostic, extendable CRUD controllers
- :mag_right: Rich query parsing — filters, pagination, sorting, relations, nested relations, cache
- :telescope: Framework-agnostic query builder for frontend use
- :space_invader: Query, path params, and DTO validation included
- :clapper: Override any generated controller method with ease
- :wrench: Tiny config (per-controller or global)
- :gift: Additional helper decorators
- :pencil2: Swagger documentation (optional peer)

## Packages

- [**@nestjs-crud/core**](https://www.npmjs.com/package/@nestjs-crud/core) — `@Crud()` decorator, global configuration, validation, helper decorators ([docs](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers#description))
- [**@nestjs-crud/request**](https://www.npmjs.com/package/@nestjs-crud/request) — `RequestQueryBuilder` for frontend use and `RequestQueryParser` for backend query/path param handling ([docs](https://github.com/kodjunkie/nestjs-crud/wiki/Requests#frontend-usage))
- [**@nestjs-crud/typeorm**](https://www.npmjs.com/package/@nestjs-crud/typeorm) — TypeORM adapter: base `TypeOrmCrudService` with CRUD database operations ([docs](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm))
- [**@nestjs-crud/drizzle**](https://www.npmjs.com/package/@nestjs-crud/drizzle) — Drizzle ORM adapter: base `DrizzleCrudService` with CRUD database operations ([docs](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceDrizzle))
- [**@nestjs-crud/mikro-orm**](https://www.npmjs.com/package/@nestjs-crud/mikro-orm) — MikroORM adapter: base `MikroOrmCrudService` with CRUD database operations ([docs](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceMikroOrm))

## Documentation

- :dart: [General Information](https://github.com/kodjunkie/nestjs-crud/wiki#why)
- :video_game: [CRUD Controllers](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers#description)
- :horse_racing: [CRUD ORM Services](https://github.com/kodjunkie/nestjs-crud/wiki/Services#description)
- :trumpet: [Handling Requests](https://github.com/kodjunkie/nestjs-crud/wiki/Requests#description)

## Credits

Built on the work of [Michael Yali](https://twitter.com/MichaelYali) and the [`@nestjsx/crud` contributors](https://github.com/nestjsx/crud/graphs/contributors). See [`NOTICE.md`](NOTICE.md) for the full fork history and attribution.

## License

[MIT](LICENSE) — carries both the upstream author's 2018-Present copyright and the fork maintainer's 2026-Present copyright. Both notices must be preserved in any further fork.
