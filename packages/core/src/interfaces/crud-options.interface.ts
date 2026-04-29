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
}

export interface MergedCrudOptions extends CrudOptions {
  auth?: AuthOptions;
}
