<div align="center">
  <h1>CRUD (@nestjsx/util)</h1>
</div>
<div align="center">
  <strong>for RESTful APIs built with NestJs</strong>
</div>

<br />

<div align="center">
  <sub>Built by
  <a href="https://twitter.com/MichaelYali">@MichaelYali</a> and
  <a href="https://github.com/nestjsx/crud/graphs/contributors">
    Contributors
  </a>
</div>

<br />

We believe that everyone who's working with NestJs and building some RESTful services and especially some CRUD functionality will find `@nestjsx/crud` microframework very useful.

## Features

<img align="right" src="https://raw.githubusercontent.com/nestjsx/crud/master/img/crud-usage2.png" alt="CRUD usage" />

- Super easy to install and start using the full-featured controllers and services :point_right:

- DB and service agnostic extendable CRUD controllers

- Reach query parsing with filtering, pagination, sorting, relations, nested relations, cache, etc.

- Framework agnostic package with query builder for a frontend usage

- Query, path params and DTOs validation included

- Overriding controller methods with ease

- Tiny config (including globally)

- Additional helper decorators

- Swagger documentation

## Packages

- [**@nestjsx/crud**](https://www.npmjs.com/package/@nestjsx/crud) - core package which provides `@Crud()` decorator for endpoints generation, global configuration, validation, helper decorators ([docs](https://github.com/nestjsx/crud/wiki/Controllers#description))
- [**@nestjsx/crud-request**](https://www.npmjs.com/package/@nestjsx/crud-request) - request builder/parser package which provides `RequestQueryBuilder` class for a frontend usage and `RequestQueryParser` that is being used internally for handling and validating query/path params on a backend side ([docs](https://github.com/nestjsx/crud/wiki/Requests#frontend-usage))
- [**@nestjsx/crud-typeorm**](https://www.npmjs.com/package/@nestjsx/crud-typeorm) - TypeORM package which provides base `TypeOrmCrudService` with methods for CRUD database operations ([docs](https://github.com/nestjsx/crud/wiki/ServiceTypeorm))

## Documentation

- [General Information](https://github.com/nestjsx/crud/wiki#why)
- [CRUD Controllers](https://github.com/nestjsx/crud/wiki/Controllers#description)
- [CRUD ORM Services](https://github.com/nestjsx/crud/wiki/Services#description)
- [Handling Requests](https://github.com/nestjsx/crud/wiki/Requests#description)

## Support

Any support is welcome. At least you can give us a star.

## License

[MIT](LICENSE)
