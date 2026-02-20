## Why?

[NestJS](https://github.com/nestjs/nest) is probably one of the best things that happened to Node.js community a couple of years ago. It was a missing part that provides a truly important architectural solution for a wide range of backend development aspects. But, despite the fact that it allows creating RESTful applications efficiently, an important CRUD scaffolding functionality that is present in many other HTTP frameworks was missing. That's why **Nestjsx/crud** came out. And we hope you'll find it very useful.

## Structure

The project follows monorepository structural practice and contains several packages:

- [**@nestjs-crud/core**](https://www.npmjs.com/package/@nestjs-crud/core) - core package which provides `@Crud()` decorator for endpoints generation, global configuration, validation, helper decorators ([docs](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers))
- [**@nestjs-crud/typeorm**](https://www.npmjs.com/package/@nestjs-crud/typeorm) - TypeORM package which provides base `TypeOrmCrudService` with methods for CRUD database operations for relational databases ([docs]())
- [**@nestjs-crud/request**](https://www.npmjs.com/package/@nestjs-crud/request) - request builder/parser package wich provides `RequestQueryBuilder` class for a frontend usage and `RequestQueryParser` that is being used internaly for handling and validating query/path params on a backend side ([docs]())

## Cloning and running tests

1. Clone this repository.

2. Run preparational scripts:

```shell
docker-compose up -d
yarn bootstrap
yarn build
yarn test
```

## Running an example project

1. Clone and [prepare](#cloning-and-running-tests) an example project.

2. Start a project:

```shell
yarn db:prepare:typeorm
yarn start:typeorm
```

3. Use `http://localhost:3000/docs` to try it out.

4. the code of example projects can be found under [integration](https://github.com/kodjunkie/nestjs-crud/tree/master/integration) folder.
