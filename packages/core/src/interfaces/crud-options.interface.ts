import { ValidationPipeOptions } from '@nestjs/common';

import { CrudRoutesFactory } from '../crud';
import { ModelOptions } from './model-options.interface';
import { ParamsOptions } from './params-options.interface';
import { QueryOptions } from './query-options.interface';
import { RoutesOptions } from './routes-options.interface';
import { AuthOptions } from './auth-options.interface';
import { DtoOptions } from './dto-options.interface';
import { SerializeOptions } from './serialize-options.interface';
import { CrudSwaggerOptions } from './crud-swagger-options.interface';

export interface CrudRequestOptions {
  query?: QueryOptions;
  routes?: RoutesOptions;
  params?: ParamsOptions;
}

export interface CrudOptions {
  model: ModelOptions;
  dto?: DtoOptions;
  serialize?: SerializeOptions;
  query?: QueryOptions;
  routes?: RoutesOptions;
  routesFactory?: typeof CrudRoutesFactory;
  params?: ParamsOptions;
  validation?: ValidationPipeOptions | false;
  /** Controller-scoped Swagger/OpenAPI metadata overrides applied to every generated route. */
  swagger?: CrudSwaggerOptions;

  /**
   * Name of the controller property that holds the CrudService instance.
   * Default: `'service'`. Set this when your controller injects the service
   * under a domain-specific name (e.g., `usersService`, `usersRepo`).
   * Reserved keys (`'__proto__'`, `'constructor'`, `'prototype'`) are rejected at decoration time.
   */
  serviceProperty?: string;

  /**
   * Pagination mode for `getManyBase` (controller-level default).
   * - 'offset' (default): existing offset/page response shape `{ data, count, total, page, pageCount }`.
   * - 'cursor': opt-in cursor pagination — response shape `{ data, count, cursor: { next, prev } }`.
   *
   * Per-route override available via `query.pagination` on `QueryOptions`.
   * Cursor mode requires a single explicit sort field and a `limit`; cursor
   * tokens are opaque base64url JSON, NOT signed (authorization stays in
   * `@CrudAuth`).
   *
   * @since 2.2.0
   */
  pagination?: 'offset' | 'cursor';
}

export interface MergedCrudOptions extends CrudOptions {
  auth?: AuthOptions;
}
