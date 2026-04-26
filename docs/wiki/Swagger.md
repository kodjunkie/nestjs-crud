# Swagger / OpenAPI

Describe the API surface for `@Crud()`-generated routes. `@nestjs-crud/core` auto-generates operation summaries, per-route markdown descriptions, error responses, request-body examples, and query-parameter documentation. Consumers can override or opt out via `@Crud({ swagger: {...} })`.

> `@nestjs/swagger` is an optional peer dependency. When it is not installed, `@nestjs-crud/core` silently skips all Swagger decoration via `safeRequire`. See [Swagger-less mode](#swagger-less-mode) below.

## Quickstart

### 1. Install `@nestjs/swagger`

```bash
npm i @nestjs/swagger
```

### 2. Wire `SwaggerModule` in `main.ts`

```typescript
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('My API')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('/api', app, document);

  await app.listen(3000);
}
bootstrap();
```

UI: `http://localhost:3000/api`. JSON: `http://localhost:3000/api-json`. For deeper `SwaggerModule` options (custom UI, auth, multi-document setups), see the upstream [NestJS OpenAPI docs](https://docs.nestjs.com/openapi/introduction).

### 3. Annotate the entity

```typescript
import { ApiProperty } from '@nestjs/swagger';

export class User {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
  @ApiProperty({ required: false }) email?: string;
}
```

### 4. Declare the controller

```typescript
import { Controller } from '@nestjs/common';
import { Crud, CrudController } from '@nestjs-crud/core';
import { User } from './user.entity';
import { UsersService } from './users.service';

@Crud({ model: { type: User } })
@Controller('users')
export class UsersController implements CrudController<User> {
  constructor(public service: UsersService) {}
}
```

That produces eight routes with imperative summaries (`List users`, `Get user by id`, `Create users in bulk`, ...), per-route markdown descriptions, `400` and `404` error responses, and request-body examples synthesized from `@ApiProperty` metadata.

## What ships by default

- **Auto `@ApiTags`.** Controllers without an explicit `@ApiTags` get one assigned from the pluralized entity name (`User` → `Users`). If the class is already decorated with `@ApiTags(...)`, the existing tag wins and no auto-assignment happens.
- **Imperative operation summaries.** `List users`, `Get user by id`, `Create user`, `Create users in bulk`, `Partially update user`, `Replace user`, `Delete user`, `Restore soft-deleted user`.
- **Per-route markdown descriptions** referencing supported query parameters, validation groups (`CrudValidationGroups.CREATE` and `UPDATE`), and soft-delete semantics where relevant.
- **Error responses.** `400 Bad Request` on every generated route. `404 Not Found` on single-resource routes (`get`, `update`, `replace`, `delete`, `recover`). `401 Unauthorized` when the controller is decorated with `@CrudAuth()`.
- **Request-body examples.** Create, update, and replace routes ship an example payload synthesized from the entity's `@ApiProperty` metadata.
- **Query-parameter documentation** with `Docs` backlinks to the [Query Syntax](Query-Syntax) wiki page, covering `?s=`, `?filter=`, `?or=`, `?sort=`, `?fields=`, `?join=`, `?limit=`, `?offset=`, `?page=`, `?cache=`.
- **Outcome-focused response text** (`Paginated list of matching resources`, `Resource created`, `Resource removed`).

## Customization with `@Crud({ swagger: {...} })`

All fields below are optional. Override only what you need.

| Option | Type | Default | Purpose |
|--------|------|---------|---------|
| `tag` | `string \| string[]` | pluralized entity name | Override the auto-assigned `@ApiTags` value. |
| `tagWithVersion` | `boolean` | `false` | On versioned controllers (`@Controller({ version })`), prepend `v{version}/` to the default tag so auto-tags do not collide across API versions. Has no effect when `tag` is set manually. |
| `description` | `string` | `undefined` | Free-form controller-level description surfaced in the emitted OpenAPI metadata. Consumer prose; do not interpolate untrusted input. |
| `examples` | `boolean` | `true` | Set to `false` to opt out of request-body example synthesis on create, update, and replace routes. |
| `synthExample` | `(entity: any, route: BaseRouteName) => unknown` | built-in `@ApiProperty` synthesizer | Supply your own example synthesizer. Takes precedence over the built-in path. The return value ships verbatim into the emitted OpenAPI JSON, so do not return secrets. |
| `operations` | `Partial<Record<BaseRouteName, Omit<Partial<ApiOperationOptions>, 'operationId'>>>` | `{}` | Per-route overrides for generated operation metadata (summary, description, tags, responses). `operationId` is intentionally omitted (see callout below). |
| `errorResponses.unauthorized` | `boolean` | auto-emitted only when `@CrudAuth()` is present | Force-emit `401 Unauthorized` on every generated route even without `@CrudAuth()`. Useful when authentication is enforced via a globally-registered guard (`APP_GUARD`). |

### Override the tag and add a description

```typescript
@Crud({
  model: { type: User },
  swagger: {
    tag: 'Users',
    description: 'User account management — all operations require a session token.',
  },
})
@Controller('users')
export class UsersController implements CrudController<User> {
  constructor(public service: UsersService) {}
}
```

### Disable request-body examples

```typescript
@Crud({
  model: { type: User },
  swagger: { examples: false },
})
@Controller('users')
export class UsersController implements CrudController<User> {
  constructor(public service: UsersService) {}
}
```

### Custom body synthesizer

```typescript
import { BaseRouteName } from '@nestjs-crud/core';

@Crud({
  model: { type: User },
  swagger: {
    synthExample: (entity: any, route: BaseRouteName) => {
      if (route === 'createOneBase') {
        return { name: 'Ada Lovelace', email: 'ada@example.com' };
      }
      return {};
    },
  },
})
@Controller('users')
export class UsersController implements CrudController<User> {
  constructor(public service: UsersService) {}
}
```

### Per-route metadata override

```typescript
@Crud({
  model: { type: User },
  swagger: {
    operations: {
      getManyBase: {
        summary: 'Paginated user list',
        description: 'Returns up to 100 users. Use `?page=N` for pagination.',
      },
    },
  },
})
@Controller('users')
export class UsersController implements CrudController<User> {
  constructor(public service: UsersService) {}
}
```

> `operationId` cannot be overridden. It is rejected at compile time (the type signature uses `Omit<..., 'operationId'>`) and re-applied at runtime using the canonical `{routeName}{ControllerName}{ModelName}` format. OpenAPI requires `operationId` uniqueness across the full emitted document, and consumer overrides would reintroduce duplicate-id footguns.

### Force-emit `401 Unauthorized` (global-guard setup)

Use this when your app enforces authentication via an `APP_GUARD` provider rather than the `@CrudAuth()` decorator. Without it, the `401` path is absent from the emitted OpenAPI document.

```typescript
@Crud({
  model: { type: User },
  swagger: { errorResponses: { unauthorized: true } },
})
@Controller('users')
export class UsersController implements CrudController<User> {
  constructor(public service: UsersService) {}
}
```

## Versioned controllers

When `app.enableVersioning()` is active and multiple controllers share a model name across versions, the default auto-tag can collide (for example `Users` for both a v1 and a v2 controller). Setting `swagger.tagWithVersion: true` prepends `v{version}/` read from NestJS's controller-version metadata:

```typescript
@Crud({ model: { type: User }, swagger: { tagWithVersion: true } })
@Controller({ version: '2', path: 'users' })
export class UsersControllerV2 implements CrudController<User> {
  constructor(public service: UsersService) {}
}
```

Emitted tag: `v2/Users` (disambiguated from the v1 `Users` tag). Has no effect when `tag` is set manually, or when the controller has no version metadata.

## Query-parameter documentation

Every built-in query parameter (`?s=`, `?filter=`, `?or=`, `?sort=`, `?fields=`, `?join=`, `?limit=`, `?offset=`, `?page=`, `?cache=`) ships with a description carrying a `Docs` backlink to the [Query Syntax](Query-Syntax) wiki page. Consumers do not configure this; it is always on.

## Swagger-less mode

`@nestjs/swagger` is declared as an optional peer dependency. When it is not installed, `@nestjs-crud/core` uses `safeRequire` to silently skip every Swagger decoration path. `@Crud()` controllers still work; only the OpenAPI document is unavailable.

A dedicated CI sentinel job (`test (no-swagger)` in `.github/workflows/tests.yml`) runs the full test suite without `@nestjs/swagger` installed, verifying that this path stays functional on every push.

## Advanced: subclassing `CrudRoutesFactory`

> Internal API change in v2.0.0. `Swagger.operationsMap(modelName)` now returns `{ summary, description }` tuples per route instead of plain summary strings.

Consumers who subclassed `CrudRoutesFactory` on v1.x and imported `Swagger.operationsMap` directly must destructure the new shape:

```typescript
// v1.x:
const summary = Swagger.operationsMap(this.modelName)[name];
Swagger.setOperation({ summary, ... }, this.targetProto[name]);

// v2.0.0+:
const { summary, description } = Swagger.operationsMap(this.modelName)[name];
Swagger.setOperation({ summary, description, ... }, this.targetProto[name]);
```

The new per-route markdown description (referencing supported query parameters and validation groups) ships alongside the summary; destructure and forward it into `setOperation` to preserve the full generated metadata.

## See also

- [Controllers](Controllers) — `@Crud()` decorator, request lifecycle, route generation
- [Query Syntax](Query-Syntax) — target of the auto-emitted `Docs` backlinks
- [ServiceTypeorm](ServiceTypeorm), [ServicePrisma](ServicePrisma), [ServiceDrizzle](ServiceDrizzle), [ServiceMikroOrm](ServiceMikroOrm) — per-adapter setup
- [NestJS OpenAPI docs](https://docs.nestjs.com/openapi/introduction) — upstream `SwaggerModule` setup, custom UI, auth integration
