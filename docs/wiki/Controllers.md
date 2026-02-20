## Description

[**@nestjs-crud/core**](https://www.npmjs.com/package/@nestjs-crud/core) - core package which provides `@Crud()` controller decorator for endpoints generation, global configuration, validation, helper decorators.

## Table of Contents

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

Let's take a look at the example of using `@nestjs-crud/core` with TypeORM.

Assume we have some TypeORM **entity**:

```typescript
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Company {
  @PrimaryGeneratedColumn() id: number;

  @Column() name: string;
}
```

Then we need to create a **service**:

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

We've done with the service so let's create a **controller**:

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

All we have to do next is to connect our service and controller in the `CompaniesModule` as we usually do:

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

That's it.

## API Endpoints

`Crud()` decorator generates the following API endpoints:

### Get many resources

> `GET /heroes`  
> `GET /heroes/:heroId/perks`

_Result:_ array of resources | pagination object with data  
_Status Codes:_ 200

### Get one resource

> `GET /heroes/:id`  
> `GET /heroes/:heroId/perks:id`

_Request Params:_ `:id` - some resource field (slug)  
_Result:_ resource object | error object  
_Status Codes:_ 200 | 404

### Create one resource

> `POST /heroes`  
> `POST /heroes/:heroId/perks`

_Request Body:_ resource object | resource object with nested (relational) resources  
_Result:_ created resource object | error object  
_Status Codes:_ 201 | 400

### Create many resources

> `POST /heroes/bulk`  
> `POST /heroes/:heroId/perks/bulk`

_Request Body:_ array of resources objects | array of resources objects with nested (relational) resources

```json
{
  "bulk": [{ "name": "Batman" }, { "name": "Batgirl" }]
}
```

_Result:_ array of created resources | error object  
_Status codes:_ 201 | 400

### Update one resource

> `PATCH /heroes/:id`  
> `PATCH /heroes/:heroId/perks/:id`

_Request Params:_ `:id` - some resource field (slug)  
_Request Body:_ resource object (or partial) | resource object with nested (relational) resources (or partial)  
_Result:_: updated partial resource object | error object  
_Status codes:_ 200 | 400 | 404

### Replace one resource

> `PUT /heroes/:id`  
> `PUT /heroes/:heroId/perks/:id`

_Request Params:_ `:id` - some resource field (slug)  
_Request Body:_ resource object | resource object with nested (relational) resources (or partial)  
_Result:_: replaced resource object | error object  
_Status codes:_ 200 | 400

### Delete one resource

> `DELETE /heroes/:id`  
> `DELETE /heroes/:heroId/perks/:id`

_Request Params:_ `:id` - some resource field (slug)  
_Result:_: empty | resource object | error object  
_Status codes:_ 200 | 404

## Swagger

[Swagger](https://docs.nestjs.com/recipes/swagger) support is present out of the box.

## Options

`Crud()` decorator accepts the following `CrudOptions`:

### model

```typescript
@Crud({
  model: {
    type: Entity|Model|DTO
  },
  ...
})
```

_Required_

`Entity`, `Model` or `DTO` class must be provided here. Everything else described bellow is optional. It's needed for a built in validation based on NestJS `ValidationPipe`.

### validation

```typescript
@Crud({
  ...
  validation?: ValidationPipeOptions | false;
  ...
})
```

_Optional_

Accepts `ValidationPipe` options or `false` if you want to use your own validation implementation.

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

_Optional_

By default `@Crud()` decorator will use `id` with the type `number` as a primary slug param.

If you have, for instance, a resorce field called `slug`
or whatever, it's a UUID and you need it to be a primary slug by which your resource should be fetched, you can set up this params options:

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

If you have a controller path with that looks kinda similar to this `/companies/:companyId/users` you need to add this param option:

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

Also, you can disable `id` param if you want to have only few routs without any path params. It's very useful, for creating something like `GET /me` endpoints.

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

_Optional_

It's a set of options for each of the generated routes.

`interceptors` - an array of your custom interceptors  
`decorators` - an array of your custom decorators  
`allowParamsOverride` - whether or not to allow body data be overriten by the URL params on PATH request. Default: `false`  
`returnDeleted` - whether or not an entity object should be returned in the response body on DELETE request. Default: `false`
`returnShallow` - whether or not to return a shallow entity

Also you can specify what routes should be excluded or what routes whould be used only by providing routes names to the `exclude` or `only` accordingly.

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

_Optional_

It's a set of query options fro GET request.

#### allow

```typescript
{
  allow: ['name', 'email'];
}
```

_Optional_

An Array of fields that are allowed to be received in GET requests. If empty or _undefined_ - allow all.

#### exclude

```typescript
{
  exclude: ['accessToken'];
}
```

_Optional_

An Array of fields that will be excluded from the GET response (and not queried from the DB).

#### persist

```typescript
{
  persist: ['createdAt'];
}
```

_Optional_

An Array of fields that will be always persisted in GET response.

#### filter

_Optional_

This option can be used in two scenarios:

1. If you want to add some conditions to the request:

```typescript
{
  filter: {
    isActive: {
      $ne: false;
    }
  }
}
```

...which is the same as:

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

2. If you want to transform your query search conditions or event return a completely new one (i.e. persist only one set of conditions and ignore search coming from the request):

- Totally ignore any query search conditions:

```typescript
{
  filter: () => {};
}
```

- Totally ignore any query search conditions and persist some conditions:

```typescript
{
  filter: () => ({
    isActive: {
      $ne: false;
    }
  });
}
```

- Transform query search conditions:

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

**_Notice:_** First function parameter here, `search`, will always be either `{ $and: [...] }` or `{ $or: [...] }`. It depends on if you're using [`@CrudAuth()`](#request-authentication) decorator:

- if you are not using it, or if you do and it has `filter` function then `search` will contain `$and` type of conditions.
- if you are using it and it has `or` function then `search` will contain `$or` type of conditions.

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

_Optional_

An Object of relations that allowed to be fetched by passing `join` query parameter in GET requests.

Each key of `join` object must **strongly match** the name of the corresponding resource relation. If particular relation name **is not** present in this option, then user **will not be able** to get this relational objects in GET request.

Each relation option can have (all below are optional):

`allow` - an Array of fields that are allowed to be received in GET requests. If empty or _undefined_ - allow all.  
`exclude` - an Array of fields that will be excluded from the GET response (and not queried from the DB).  
`persist` - an Array of fields that will be always persisted in GET response.  
`eager` - type `boolean` - whether or not current relation should persist in every GET response.
`require` - should a relation be required or not. For RMDBS means use either `INNER` or `LEFT` join. Default: `false`.  
`alias` - set alias for a relation.  
`select` - type `boolean` - if `false` then the relation will be joined but not selected and not included in the response.

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

_Optional_

An Array of `sort` objects that will be merged (combined) with query `sort` if those are passed in GET request. If not - `sort` will be added to the DB query as a stand-alone condition.

#### limit

```typescript
{
  limit: 25,
}
```

_Optional_

Default `limit` that will be aplied to the DB query.

#### maxLimit

```typescript
{
  maxLimit: 100,
}
```

_Optional_

Max amount of results that can be queried in GET request.

**_Notice:_** **_it's strongly recommended to set up this option. Otherwise DB query will be executed without any LIMIT if no `limit` was passed in the query or if the `limit` option hasn't been set up in crud options_**.

#### cache

```typescript
{
  cache: 2000,
}
```

_Optional_

If `Caching Results` is implemented on you project, then you can set up default `cache` in milliseconds for GET response data.

Cache can be reseted by using `cache=0` query parameter in your GET requests.

#### alwaysPaginate

```typescript
{
  alwaysPaginate: true,
}
```

_Optional_

Either or not always return an object with paginated data. Can be defined [globally](#global-options) as well.

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

_Optional_

Request body validation DTO classes. If no DTO is provided to any of the option, then a [`CrudOptions.model.type`](#model) will be used as described in the [Request validation](#request-validation) section.

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

_Optional_

Response serialization DTO classes. Each option also accepts `false` in order to not perform serialization for particular route.

Please see [Response serialization](#response-serialization) section for more details.

## Global options

In order to reduce some repetition in your `CrudOptions` in every controller you can specify some options globally:

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

`queryParser` are options for `RequestQueryParser` that is being used in `CrudRequestInterceptor` to parse/validate query and path params. Frontend has similar [customization](https://github.com/kodjunkie/nestjs-crud/wiki/Requests#customize) ability.

`routes` are the same as [here](#routes).

`params` are the same as [here](#params).

`query` are similar to options described [here](#query) except the fact that `limit`, `maxLimit`, `cache`, `alwaysPaginate` can be applied only.

`serialize` allows you to globally disable [serialization](#serialize) for particular actions.

So in order to apply global options you need load them in your **main.ts (index.ts) file BEFORE you import `AppModule` class**. That's because TypeScript decorators are executed when we declare our class but not when we create new class instance. So in your `main.ts`:

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

**_Notice:_** all those options can be overridden in each `CrudController`.

## Request authentication

In order to perform data filtering for authenticated requests, we provide `@CrudAuth()` decorator. It accepts these options:

```typescript
{
  property?: string;
  filter?: (req: any) => SCondition | void;
  or?: (req: any) => SCondition | void;
  persist?: (req: any) => ObjectLiteral;
}
```

`property` - property on the `Request` object where user's data stored after successful authentication. Can be set [globally](#global-options) as well.

`filter` - a function that should return [search](https://github.com/kodjunkie/nestjs-crud/wiki/Requests#search) condition and will be added to the query search params and path params as a `$and` condition:

> `{Auth condition} AND {Path params} AND {Search|Filter}`

`or` - a function that should return [search](https://github.com/kodjunkie/nestjs-crud/wiki/Requests#search) condition and will be added to the query search params and path params as a `$or` condition. If it's used then `filter` function will be ignored.

> `{Auth condition} OR ({Path params} AND {Search|Filter})`

`persist` - a function that can return an object that will be added to the DTO on `create`, `update`, `replace` actions. Useful in case if you need to prevent changing some sensitive entity properties even if it's allowed in DTO validation.

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

Query params and path params validation is performed by an interceptor. It parses query and path parameters and then validates them.

Body request validation is done by NestJs `ValidationPipe`.

You can provide either `create`, `update`, `replace` DTO in the [`CrudOptions.dto`](#dto) options or use the following approach.

You can use [`CrudOptions.model.type`](#model) as a DTO that describes validation rules. We distinguish body validation on `create` and `update` methods. This was achieved by using [validation groups](https://github.com/typestack/class-validator#validation-groups).

Let's take a look at this example:

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

You can import `CrudValidationGroups` enum and set up validation rules for each field on firing of `POST`, `PATCH` requests or both of them.

## Response serialization

Serialization is performed using `class-transformer` package and is already included and turned ON in each route.

So in your entity you can use some useful decorators:

```typescript
import { Exclude } from 'class-transformer';

export class User {
  email: string;

  @Exclude()
  password: string;
}
```

But there might be situations when you might need to use different serialization in different routes. In that case you can use [`CrudOptions.serialize`](#serialize) options.

## IntelliSense

Please, keep in mind that we compose crud controllers by the logic inside our `@Crud()` class decorator. And there are some unpleasant but not very significant side effects of this approach.

First, there is no IntelliSense on composed methods. That's why we need to use `CrudController` interface. This will help to make sure that you're injecting proper `CrudService`.

Second, even after adding `CrudController` interface you still wouldn't see composed methods, accessible from `this` keyword, furthermore, you'll get a TS error. In order to solve this, you can do as follows:

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

Here is the list of composed base routes methods by `@Crud()` decorator:

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

Since all composed methods have `Base` ending in their names, overriding those endpoints could be done in two ways:

1. Attach `@Override()` decorator without any argument to the newly created method wich name doesn't contain `Base` ending. So if you want to override `getManyBase`, you need to create `getMany` method.

2. Attach `@Override('getManyBase')` decorator with passed base method name as an argument if you want to override base method with a function that has a custom name.

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

**_Notice:_** new custom route decorators were created to simplify process: `@ParsedRequest()` and `@ParsedBody()`. But you still can add your param decorators to any of the methods, e.g. `@Param()`, `@Session()`, etc. Or any of your own cutom route decorators.

## Adding routes

Sometimes you might need to add a new route and to use `@ParsedRequest()` in it. You need attach `CrudRequestInterceptor` in order to do that:

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
  // some awesome feature handling
}
```

## Additional decorators

There are two additional decorators that come out of the box: `@Feature()` and `@Action()`. You can use them with your [ACL](https://en.wikipedia.org/wiki/Access_control_list) implementation. `@Action()` will be applyed automaticaly on controller compoesd base methods. There is `CrudActions` enum that you can import and use:

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

`ACLGuard` dummy example with helper functions `getFeature` and `getAction`:

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
