## Why?

[NestJS](https://github.com/nestjs/nest) is probably one of the best things that happened to Node.js community a couple of years ago. It was a missing part that provides a truly important architectural solution for a wide range of backend development aspects. But, despite the fact that it allows creating RESTful applications efficiently, an important CRUD scaffolding functionality that is present in many other HTTP frameworks was missing. That's why **Nestjsx/crud** came out. And we hope you'll find it very useful.

## Structure

The project follows monorepository structural practice and contains several packages:

- [**@nestjs-crud/core**](https://www.npmjs.com/package/@nestjs-crud/core) - core package which provides `@Crud()` decorator for endpoints generation, global configuration, validation, helper decorators ([docs](https://github.com/kodjunkie/nestjs-crud/wiki/Controllers))
- [**@nestjs-crud/request**](https://www.npmjs.com/package/@nestjs-crud/request) - request builder/parser package which provides `RequestQueryBuilder` class for a frontend usage and `RequestQueryParser` that is being used internally for handling and validating query/path params on a backend side ([docs](https://github.com/kodjunkie/nestjs-crud/wiki/Requests))
- [**@nestjs-crud/typeorm**](https://www.npmjs.com/package/@nestjs-crud/typeorm) - TypeORM package which provides base `TypeOrmCrudService` with methods for CRUD database operations ([docs](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceTypeorm))
- [**@nestjs-crud/mikro-orm**](https://www.npmjs.com/package/@nestjs-crud/mikro-orm) - MikroORM package which provides base `MikroOrmCrudService` with methods for CRUD database operations ([docs](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceMikroOrm))
- [**@nestjs-crud/drizzle**](https://www.npmjs.com/package/@nestjs-crud/drizzle) - Drizzle package which provides base `DrizzleCrudService` with methods for CRUD database operations ([docs](https://github.com/kodjunkie/nestjs-crud/wiki/ServiceDrizzle))
- [**@nestjs-crud/util**](https://www.npmjs.com/package/@nestjs-crud/util) - utility package with shared helper functions used internally

## Cloning and running tests

1. Clone this repository.

2. Run preparational scripts:

```shell
docker compose up -d
yarn install
yarn build
yarn test
```

## Running an example project

1. Clone and [prepare](#cloning-and-running-tests) the project.

2. Prepare the database and start a project:

```shell
yarn db:prepare:typeorm:postgres
yarn start:typeorm
```

3. Use `http://localhost:3000/docs` to try it out.

4. The code of example projects can be found under [integration](https://github.com/kodjunkie/nestjs-crud/tree/master/integration) folder.
