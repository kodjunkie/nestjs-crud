[![Stand With Ukraine](https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/banner2-direct.svg)](https://vshymanskyy.github.io/StandWithUkraine/)

<div align="center">
  <h1>:point_right:<a href="https://github.com/nestjsx/crud/issues/784">You can help NestJs CRUD
  </a></h1>
</div>

<div align="center">
  <h1>NESTJS-CRUD</h1>
</div>
<div align="center">
  <strong>for RESTful APIs built with NestJs</strong>
</div>

<br />

> This project is forked from [`@nestjsx/crud`](https://github.com/nestjsx/crud) at version `5.0.0-alpha.3`.

We believe that everyone who's working with NestJs and building some RESTful services and especially some CRUD functionality will find `@nestjs-crud/core` microframework very useful.

## Features

<img align="right" src="img/crud-usage2.png" alt="CRUD usage" />

- :electric_plug: Super easy to install and start using the full-featured controllers and services :point_right:

- :octopus: DB and service agnostic extendable CRUD controllers

- :mag_right: Reach query parsing with filtering, pagination, sorting, relations, nested relations, cache, etc.

- :telescope: Framework agnostic package with query builder for a frontend usage

- :space_invader: Query, path params and DTOs validation included

- :clapper: Overriding controller methods with ease

- :wrench: Tiny config (including globally)

- :gift: Additional helper decorators

- :pencil2: Swagger documentation

## Packages

- [**@nestjs-crud/core**](https://www.npmjs.com/package/@nestjs-crud/core) - core package which provides `@Crud()` decorator for endpoints generation, global configuration, validation, helper decorators ([docs](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers#description))
- [**@nestjs-crud/request**](https://www.npmjs.com/package/@nestjs-crud/request) - request builder/parser package which provides `RequestQueryBuilder` class for a frontend usage and `RequestQueryParser` that is being used internally for handling and validating query/path params on a backend side ([docs](https://github.com/kodjunkie/nestjs-crud/wiki/Requests#frontend-usage))
- [**@nestjs-crud/typeorm**](https://www.npmjs.com/package/@nestjs-crud/typeorm) - TypeORM package which provides base `TypeOrmCrudService` with methods for CRUD database operations ([docs](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm))
- [**@nestjs-crud/mikro-orm**](https://www.npmjs.com/package/@nestjs-crud/mikro-orm) - MikroORM package which provides base `MikroORMCrudService` with methods for CRUD database operations (new)
- [**@nestjs-crud/drizzle**](https://www.npmjs.com/package/@nestjs-crud/drizzle) - Drizzle package which provides base `DrizzleCrudService` with methods for CRUD database operations (new)

## Documentation

- :dart: [General Information](https://github.com/kodjunkie/nestjs-crud/wiki#why)
- :video_game: [CRUD Controllers](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers#description)
- :horse_racing: [CRUD ORM Services](https://github.com/kodjunkie/nestjs-crud/wiki/Services#description)
- :trumpet: [Handling Requests](https://github.com/kodjunkie/nestjs-crud/wiki/Requests#description)

## Support

Any support is welcome. At least you can give us a star :star:

## License

[MIT](LICENSE)
