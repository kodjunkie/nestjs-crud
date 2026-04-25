# Controllers

## Description

[`@nestjs-crud/core`](https://www.npmjs.com/package/@nestjs-crud/core) provides the `@Crud()` controller decorator, global configuration, validation, and helper decorators.

## Table of contents

- [Install](#install)
- [Getting started](#getting-started)
- [API endpoints](#api-endpoints)
- [Swagger](swagger)
- [Options](#options)
  - [model](#model)
  - [validation](#validation)
  - [params](#params)
  - [routes](#routes)
  - [query](#query)
  - [dto](#dto)
  - [serialize](#serialize)
- [Global options](#global-options)
- [Request authentication](#request-authentication)
- [Request validation](#request-validation)
- [Response serialization](#response-serialization)
- [IntelliSense](#intellisense)
- [Routes override](#routes-override)
- [Adding routes](#adding-routes)
- [Additional decorators](#additional-decorators)

## Install

```shell
npm i @nestjs-crud/core class-transformer class-validator
```

### Using TypeORM

```shell
npm i @nestjs-crud/typeorm @nestjs/typeorm typeorm
```

## Getting started

Walk through `@nestjs-crud/core` with TypeORM.

Start with a TypeORM **entity**:

```typescript
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Company {
  @PrimaryGeneratedColumn() id: number;

  @Column() name: string;
}
```

Create a **service**:

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { TypeOrmCrudService } from '@nestjs-crud/typeorm';

import { Company } from './company.entity';

@Injectable()
export class CompaniesService extends TypeOrmCrudService<Company> {
  constructor(@InjectRepository(Company) repo) {
    super(repo);
  }
}
```

Wire the service into a **controller**:

```typescript
import { Controller } from '@nestjs/common';
import { Crud, CrudController } from '@nestjs-crud/core';

import { Company } from './company.entity';
import { CompaniesService } from './companies.service';

@Crud({
  model: {
    type: Company,
  },
})
@Controller('companies')
export class CompaniesController implements CrudController<Company> {
  constructor(public service: CompaniesService) {}
}
```

Register both in the `CompaniesModule`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Company } from './company.entity';
import { CompaniesService } from './companies.service';
import { CompaniesController } from './companies.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Company])],
  providers: [CompaniesService],
  exports: [CompaniesService],
  controllers: [CompaniesController],
})
export class CompaniesModule {}
```

That is the whole setup.

## API endpoints

`@Crud()` generates the following endpoints:

### Get many resources

> `GET /heroes`
> `GET /heroes/:heroId/perks`

_Result:_ array of resources, or a pagination object with data
_Status codes:_ 200

### Get one resource

> `GET /heroes/:id`
> `GET /heroes/:heroId/perks/:id`

_Request params:_ `:id` (some resource field acting as the slug)
_Result:_ resource object, or error object
_Status codes:_ 200, 404

### Create one resource

> `POST /heroes`
> `POST /heroes/:heroId/perks`

_Request body:_ resource object, or resource object with nested (relational) resources
_Result:_ created resource object, or error object
_Status codes:_ 201, 400

### Create many resources

> `POST /heroes/bulk`
> `POST /heroes/:heroId/perks/bulk`

_Request body:_ array of resource objects, or array of resource objects with nested (relational) resources

```json
{
  "bulk": [{ "name": "Batman" }, { "name": "Batgirl" }]
}
```

_Result:_ array of created resources, or error object
_Status codes:_ 201, 400

### Update one resource

> `PATCH /heroes/:id`
> `PATCH /heroes/:heroId/perks/:id`

_Request params:_ `:id` (some resource field acting as the slug)
_Request body:_ resource object (partial allowed), or with nested (relational) resources
_Result:_ updated partial resource object, or error object
_Status codes:_ 200, 400, 404

### Replace one resource

> `PUT /heroes/:id`
> `PUT /heroes/:heroId/perks/:id`

_Request params:_ `:id` (some resource field acting as the slug)
_Request body:_ resource object, or with nested (relational) resources (partial allowed)
_Result:_ replaced resource object, or error object
_Status codes:_ 200, 400

### Delete one resource

> `DELETE /heroes/:id`
> `DELETE /heroes/:heroId/perks/:id`

_Request params:_ `:id` (some resource field acting as the slug)
_Result:_ empty, resource object, or error object
_Status codes:_ 200, 404

## Swagger

See [Swagger](Swagger) for setup and the full `@Crud({ swagger: {...} })` customization reference.

## Options

`@Crud()` accepts the following `CrudOptions`:

### model

```typescript
@Crud({
  model: {
    type: Entity|Model|DTO
  },
  ...
})
```

_Required._

The `Entity`, `Model`, or `DTO` class. Everything else is optional. The class is also used for built-in validation via NestJS's `ValidationPipe`.

### validation

```typescript
@Crud({
  ...
  validation?: ValidationPipeOptions | false;
  ...
})
```

_Optional._

Accepts `ValidationPipe` options, or `false` to use your own validation.

### params

```typescript
@Crud({
  ...
  params?: {
    [key: string]: {
      field: string;
      type: 'number' | 'string' | 'uuid';
      primary?: boolean;
      disabled?: boolean;
    },
  },
  ...
})
```

_Optional._

By default, `@Crud()` uses `id` of type `number` as the primary slug param.

If your resource uses a UUID `slug` field as the primary identifier:

```typescript
@Crud({
  ...
  params: {
    slug: {
      field: 'slug',
      type: 'uuid',
      primary: true,
    },
  },
  ...
})
```

For a controller path like `/companies/:companyId/users`, declare the parent param:

```typescript
@Crud({
  ...
  params: {
    ...
    companyId: {
      field: 'companyId',
      type: 'number'
    },
  },
  ...
})
```

You can also disable the `id` param when you need a few routes without path params (for example, a `GET /me` endpoint):

```typescript
@Crud({
  model: {
    type: User,
  },
  routes: {
    only: ['getOneBase', 'updateOneBase'],
  },
  params: {
    id: {
      primary: true,
      disabled: true,
    },
  },
  query: {
    join: {
      company: {
        eager: true,
      },
      profile: {
        eager: true,
      },
    },
  },
})
@CrudAuth({
  property: 'user',
  filter: (user: User) => ({
    id: user.id,
  }),
})
@Controller('me')
export class MeController {
  constructor(public service: UsersService) {}
}
```

### routes

```typescript
@Crud({
  ...
  routes?: {
    exclude?: BaseRouteName[],
    only?: BaseRouteName[],
    getManyBase?: {
      interceptors?: [],
      decorators?: [],
    },
    getOneBase?: {
      interceptors?: [],
      decorators?: [],
    },
    createOneBase?: {
      interceptors?: [],
      decorators?: [],
      returnShallow?: boolean;
    },
    createManyBase?: {
      interceptors?: [],
      decorators?: [],
    },
    updateOneBase: {
      interceptors?: [],
      decorators?: [],
      allowParamsOverride?: boolean,
      returnShallow?: boolean;
    },
    replaceOneBase: {
      interceptors?: [],
      decorators?: [],
      allowParamsOverride?: boolean,
      returnShallow?: boolean;
    },
    deleteOneBase?: {
      interceptors?: [],
      decorators?: [],
      returnDeleted?: boolean,
    },
  },
  ...
})
```

_Optional._

Per-route configuration:

- `interceptors`: an array of custom interceptors
- `decorators`: an array of custom decorators
- `allowParamsOverride`: whether body data can be overridden by URL params on `PATCH`. Default `false`.
- `returnDeleted`: whether to return the entity in the response body on `DELETE`. Default `false`.
- `returnShallow`: whether to return a shallow entity

You can also exclude or restrict routes with `exclude` or `only` and a list of route names.

### query

```typescript
@Crud({
  ...
  query?: {
    allow?: string[];
    exclude?: string[];
    persist?: string[];
    filter?: QueryFilterOption;
    join?: JoinOptions;
    sort?: QuerySort[];
    limit?: number;
    maxLimit?: number;
    cache?: number | false;
    alwaysPaginate?: boolean;
  },
  ...
})
```

_Optional._

Query options for `GET` requests.

#### allow

```typescript
{
  allow: ['name', 'email'];
}
```

_Optional._

Fields allowed in `GET` responses. Empty or `undefined` allows all.

#### exclude

```typescript
{
  exclude: ['accessToken'];
}
```

_Optional._

Fields excluded from the `GET` response (and not queried from the DB).

#### persist

```typescript
{
  persist: ['createdAt'];
}
```

_Optional._

Fields always present in `GET` responses.

#### filter

_Optional._

Two scenarios:

1. Add conditions to the request:

```typescript
{
  filter: {
    isActive: {
      $ne: false;
    }
  }
}
```

which is the same as:

```typescript
{
  filter: [
    {
      field: 'isActive',
      operator: '$ne',
      value: false,
    },
  ];
}
```

2. Transform incoming search conditions, or replace them entirely (for example, persist a fixed condition and ignore the request's search):

- Ignore any incoming search conditions:

```typescript
{
  filter: () => {};
}
```

- Ignore incoming search and persist your own:

```typescript
{
  filter: () => ({
    isActive: {
      $ne: false;
    }
  });
}
```

- Transform the incoming search:

```typescript
import { SCondition } from '@nestjs-crud/request'

...

{
  filter: (search: SCondition, getMany: boolean) => {
    return getMany ? search : {
      $and: [
        ...search.$and,
        { isActive: true },
      ],
    }
  };
}
```

> The first argument, `search`, is always shaped as `{ $and: [...] }` or `{ $or: [...] }`. Which one depends on [`@CrudAuth()`](#request-authentication):
>
> - If you do not use `@CrudAuth()`, or use it with a `filter` function, `search` carries `$and` conditions.
> - If you use `@CrudAuth()` with an `or` function, `search` carries `$or` conditions.

#### join

```typescript
{
  join: {
    profile: {
      persist: ['name'],
      exclude: ['token'],
      eager: true,
      require: true,
    },
    tasks: {
      allow: ['content'],
    },
    notifications: {
      eager: true,
      select: false,
    },
    company: {},
    'company.projects': {
      persist: ['status']
    },
    'users.projects.tasks': {
      exclude: ['description'],
      alias: 'projectTasks',
    },
  }
}
```

_Optional._

Relations allowed for the `join` query parameter on `GET` requests.

Each key must match the resource's relation name exactly. Relations that are not listed here cannot be requested by clients.

Per-relation options (all optional):

- `allow`: array of fields allowed in the response. Empty or `undefined` allows all.
- `exclude`: array of fields excluded from the response (and not queried).
- `persist`: array of fields always included in the response.
- `eager` (`boolean`): whether the relation is included in every `GET` response.
- `require` (`boolean`): if `true`, generates an `INNER JOIN` instead of `LEFT JOIN` for RDBMS adapters. Default `false`.
- `alias`: relation alias.
- `select` (`boolean`): if `false`, the relation is joined but not selected (excluded from the response).

#### sort

```typescript
{
  sort: [
    {
      field: 'id',
      order: 'DESC',
    },
  ];
}
```

_Optional._

Default `sort` merged with any `sort` passed in the request. Without a request-level `sort`, this default applies on its own.

#### limit

```typescript
{
  limit: 25,
}
```

_Optional._

Default `LIMIT` applied to the DB query.

#### maxLimit

```typescript
{
  maxLimit: 100,
}
```

_Optional._

Maximum number of results a single `GET` request can ask for.

> Set this in production. Without it, queries without an explicit `limit` (or without a default `limit` configured) execute with no `LIMIT` at all.

#### cache

```typescript
{
  cache: 2000,
}
```

_Optional._

When caching is configured for the project, this is the default cache duration in milliseconds for `GET` responses. See [Caching](https://github.com/kodjunkie/nestjs-crud/wiki/Caching).

Bypass with `?cache=0` on the request.

#### alwaysPaginate

```typescript
{
  alwaysPaginate: true,
}
```

_Optional._

If `true`, `GET many` always returns a paginated object (instead of a bare array). Can also be set [globally](#global-options).

### dto

```typescript
@Crud({
  ...
  dto?: {
    create?: Type<any>,
    update?: Type<any>,
    replace?: Type<any>
  },
  ...
})
```

_Optional._

Request-body validation DTO classes. If a route has no DTO declared here, the [`CrudOptions.model.type`](#model) is used. See [Request validation](#request-validation).

### serialize

```typescript
@Crud({
  ...
  serialize?: {
    getMany?: Type<any> | false;
    get?: Type<any> | false;
    create?: Type<any> | false;
    createMany?: Type<any> | false;
    update?: Type<any> | false;
    replace?: Type<any> | false;
    delete?: Type<any> | false;
  }
  ...
})
```

_Optional._

Response-serialization DTO classes. Pass `false` for any route to skip serialization on that route.

See [Response serialization](#response-serialization).

## Global options

To reduce repetition across controllers, configure some options globally:

```typescript
{
  queryParser?: RequestQueryBuilderOptions;
  routes?: RoutesOptions;
  params?: ParamsOptions;
  auth?: {
    property?: string;
  };
  query?: {
    limit?: number;
    maxLimit?: number;
    cache?: number | false;
    alwaysPaginate?: boolean;
  };
  serialize?: {
    getMany?: false;
    get?: false;
    create?: false;
    createMany?: false;
    update?: false;
    replace?: false;
    delete?: false;
  };
}
```

- `queryParser`: options for `RequestQueryParser` (used in `CrudRequestInterceptor` to parse and validate query and path params). The frontend has the same [customization](https://github.com/kodjunkie/nestjs-crud/wiki/Requests#customize) hook.
- `routes`: same as the per-controller [`routes`](#routes).
- `params`: same as the per-controller [`params`](#params).
- `query`: a subset of [`query`](#query). Only `limit`, `maxLimit`, `cache`, and `alwaysPaginate` apply globally.
- `serialize`: globally disable [serialization](#serialize) per route.

Load global options in `main.ts` (or `index.ts`) **before** importing `AppModule`. TypeScript decorators run at class declaration time, not at instantiation, so the config has to be in place before any decorated class is loaded:

```typescript
import { CrudConfigService } from '@nestjs-crud/core';

CrudConfigService.load({
  query: {
    limit: 25,
    cache: 2000,
  },
  params: {
    id: {
      field: 'id',
      type: 'uuid',
      primary: true,
    },
  },
  routes: {
    updateOneBase: {
      allowParamsOverride: true,
    },
    deleteOneBase: {
      returnDeleted: true,
    },
  },
});

import { AppModule } from './app.module';

...
```

> Each `CrudController` can override any global option.

## Request authentication

For data filtering on authenticated requests, use the `@CrudAuth()` decorator. Options:

```typescript
{
  property?: string;
  filter?: (req: any) => SCondition | void;
  or?: (req: any) => SCondition | void;
  persist?: (req: any) => ObjectLiteral;
}
```

- `property`: the property on the `Request` object that holds the authenticated user. Can be set [globally](#global-options).
- `filter`: returns a [search](https://github.com/kodjunkie/nestjs-crud/wiki/Requests#search) condition that AND-combines with query and path params:

  > `{Auth condition} AND {Path params} AND {Search|Filter}`

- `or`: returns a [search](https://github.com/kodjunkie/nestjs-crud/wiki/Requests#search) condition that OR-combines with query and path params. When set, `filter` is ignored.

  > `{Auth condition} OR ({Path params} AND {Search|Filter})`

- `persist`: returns an object merged into the DTO on `create`, `update`, and `replace`. Useful when you want to lock down sensitive entity properties even though DTO validation would allow them.

```typescript
@Crud({...})
@CrudAuth({
  property: 'user',
  filter: (user: User) => ({
    id: user.id,
    isActive: true,
  })
})
```

## Request validation

Query and path param validation runs in an interceptor that parses and validates the request.

Body validation runs through NestJS's `ValidationPipe`.

You can supply `create`, `update`, or `replace` DTOs in [`CrudOptions.dto`](#dto), or use the entity itself as the DTO.

When you use [`CrudOptions.model.type`](#model) as the DTO, body validation uses [validation groups](https://github.com/typestack/class-validator#validation-groups) to distinguish create from update. Example:

```typescript
import { Entity, Column, OneToMany } from 'typeorm';
import { IsOptional, IsString, MaxLength, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { CrudValidationGroups } from '@nestjs-crud/core';

import { BaseEntity } from '../base-entity';
import { User } from '../users/user.entity';
import { Project } from '../projects/project.entity';

const { CREATE, UPDATE } = CrudValidationGroups;

@Entity('companies')
export class Company extends BaseEntity {
  @IsOptional({ groups: [UPDATE] })
  @IsNotEmpty({ groups: [CREATE] })
  @IsString({ always: true })
  @MaxLength(100, { always: true })
  @Column({ type: 'varchar', length: 100, nullable: false })
  name: string;

  @IsOptional({ groups: [UPDATE] })
  @IsNotEmpty({ groups: [CREATE] })
  @IsString({ groups: [CREATE, UPDATE] })
  @MaxLength(100, { groups: [CREATE, UPDATE] })
  @Column({ type: 'varchar', length: 100, nullable: false, unique: true })
  domain: string;

  @IsOptional({ always: true })
  @IsString({ always: true })
  @Column({ type: 'text', nullable: true, default: null })
  description: string;

  /**
   * Relations
   */

  @OneToMany((type) => User, (u) => u.company)
  @Type((t) => User)
  users: User[];

  @OneToMany((type) => Project, (p) => p.company)
  projects: Project[];
}
```

Import `CrudValidationGroups` and apply `CREATE` and `UPDATE` group rules per field, individually or together.

## Response serialization

Serialization is on by default for every route, via `class-transformer`.

Use the standard `class-transformer` decorators on your entity:

```typescript
import { Exclude } from 'class-transformer';

export class User {
  email: string;

  @Exclude()
  password: string;
}
```

For per-route serialization (different DTO per route), use [`CrudOptions.serialize`](#serialize).

## IntelliSense

`@Crud()` composes controllers from a class decorator, which has two minor IntelliSense quirks:

First, IntelliSense does not see the composed methods. Use the `CrudController` interface to keep the injected `CrudService` typed correctly.

Second, even with `CrudController`, you cannot call composed methods on `this` without a TS error. The fix is a `base` getter:

```typescript
...
import { Crud, CrudController } from '@nestjs-crud/core';

@Crud(Hero)
@Controller('heroes')
export class HeroesCrud implements CrudController<Hero> {
  constructor(public service: HeroesService) {}

  get base(): CrudController<Hero> {
    return this;
  }
}
```

## Routes override

The base methods composed by `@Crud()`:

```typescript
{
  getManyBase(
    @ParsedRequest() req: CrudRequest,
  ): Promise<GetManyDefaultResponse<T> | T[]>;

  getOneBase(
    @ParsedRequest() req: CrudRequest,
  ): Promise<T>;

  createOneBase(
    @ParsedRequest() req: CrudRequest,
    @ParsedBody() dto: T,
  ): Promise<T>;

  createManyBase(
    @ParsedRequest() req: CrudRequest,
    @ParsedBody() dto: CreateManyDto<T>,
  ): Promise<T>;

  updateOneBase(
    @ParsedRequest() req: CrudRequest,
    @ParsedBody() dto: T,
  ): Promise<T>;

  replaceOneBase(
    @ParsedRequest() req: CrudRequest,
    @ParsedBody() dto: T,
  ): Promise<T>;

  deleteOneBase(
    @ParsedRequest() req: CrudRequest,
  ): Promise<void | T>;
}
```

Every base method ends in `Base`. Override in one of two ways:

1. Attach `@Override()` (no argument) to a method whose name drops the `Base` suffix. To override `getManyBase`, name the method `getMany`.
2. Attach `@Override('getManyBase')` (base method name as argument) to a method with any custom name.

Example:

```typescript
...
import {
  Crud,
  CrudController,
  Override,
  CrudRequest,
  ParsedRequest,
  ParsedBody,
  CreateManyDto,
} from '@nestjs-crud/core';

@Crud({
  model: {
    type: Hero,
  }
})
@Controller('heroes')
export class HeroesCrud implements CrudController<Hero> {
  constructor(public service: HeroesService) {}

  get base(): CrudController<Hero> {
    return this;
  }

  @Override()
  getMany(
    @ParsedRequest() req: CrudRequest,
  ) {
    return this.base.getManyBase(req);
  }

  @Override('getOneBase')
  getOneAndDoStuff(
    @ParsedRequest() req: CrudRequest,
  ) {
    return this.base.getOneBase(req);
  }

  @Override()
  createOne(
    @ParsedRequest() req: CrudRequest,
    @ParsedBody() dto: Hero,
  ) {
    return this.base.createOneBase(req, dto);
  }

  @Override()
  createMany(
    @ParsedRequest() req: CrudRequest,
    @ParsedBody() dto: CreateManyDto<Hero>
  ) {
    return this.base.createManyBase(req, dto);
  }

  @Override('updateOneBase')
  coolFunction(
    @ParsedRequest() req: CrudRequest,
    @ParsedBody() dto: Hero,
  ) {
    return this.base.updateOneBase(req, dto);
  }

  @Override('replaceOneBase')
  awesomePUT(
    @ParsedRequest() req: CrudRequest,
    @ParsedBody() dto: Hero,
  ) {
    return this.base.replaceOneBase(req, dto);
  }

  @Override()
  async deleteOne(
    @ParsedRequest() req: CrudRequest,
  ) {
    return this.base.deleteOneBase(req);
  }
}
```

> Two custom param decorators ship for these overrides: `@ParsedRequest()` and `@ParsedBody()`. You can still mix in any built-in NestJS param decorators (`@Param()`, `@Session()`, etc.) and your own custom ones.

## Adding routes

To add a fresh route that uses `@ParsedRequest()`, attach `CrudRequestInterceptor`:

```typescript
...
import { UseInterceptors } from '@nestjs/common';
import {
  ParsedRequest,
  CrudRequest,
  CrudRequestInterceptor,
} from '@nestjs-crud/core';
...

@UseInterceptors(CrudRequestInterceptor)
@Get('/export/list.xlsx')
async exportSome(@ParsedRequest() req: CrudRequest) {
  // your handler
}
```

## Additional decorators

Two additional decorators ship for [ACL](https://en.wikipedia.org/wiki/Access_control_list) integration: `@Feature()` and `@Action()`. `@Action()` is applied automatically on the composed base methods. The `CrudActions` enum names them:

```typescript
enum CrudActions {
  ReadAll = 'Read-All',
  ReadOne = 'Read-One',
  CreateOne = 'Create-One',
  CreateMany = 'Create-Many',
  UpdateOne = 'Update-One',
  ReplaceOne = 'Replace-One',
  DeleteOne = 'Delete-One',
}
```

A minimal `ACLGuard` example using the `getFeature` and `getAction` helpers:

```typescript
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { getFeature, getAction } from '@nestjs-crud/core';

@Injectable()
export class ACLGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const handler = ctx.getHandler();
    const controller = ctx.getClass();

    const feature = getFeature(controller);
    const action = getAction(handler);

    console.log(`${feature}-${action}`); // e.g. 'Heroes-Read-All'

    return true;
  }
}
```
