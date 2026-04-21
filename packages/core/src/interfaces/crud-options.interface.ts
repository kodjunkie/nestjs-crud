import { ValidationPipeOptions } from '@nestjs/common';

import { CrudRoutesFactory } from '../crud';
import { ModelOptions } from './model-options.interface';
import { ParamsOptions } from './params-options.interface';
import { QueryOptions } from './query-options.interface';
import { RoutesOptions } from './routes-options.interface';
import { AuthOptions } from './auth-options.interface';
import { DtoOptions } from './dto-options.interface';
import { SerializeOptions } from './serialize-options.interface';

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
  /**
   * Per-service override of the global `CrudConfigService.config.strictSanitization`.
   * See {@link CrudGlobalConfig.strictSanitization}.
   *
   * NOTE (Phase 4 / v2.0): Type surface only — NOT wired end-to-end in v2.0
   * because `@Crud()` metadata lives on the controller target and is not
   * trivially accessible at adapter-service construction time. Global
   * `CrudConfigService.config.strictSanitization` is the sole runtime source
   * in v2.0. Per-service override wire deferred to v2.1 pending
   * decorator-metadata wire investigation (Phase 4 Plan 03 A2 risk).
   *
   * @deprecated Removed in v3.
   * @since 2.0.0
   */
  strictSanitization?: boolean;
}

export interface MergedCrudOptions extends CrudOptions {
  auth?: AuthOptions;
}
