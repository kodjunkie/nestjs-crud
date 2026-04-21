import { RequestQueryBuilderOptions } from '@nestjs-crud/request';

import { RoutesOptions } from './routes-options.interface';
import { ParamsOptions } from './params-options.interface';
import { AuthGlobalOptions } from './auth-options.interface';

export interface CrudGlobalConfig {
  queryParser?: RequestQueryBuilderOptions;
  auth?: AuthGlobalOptions;
  routes?: RoutesOptions;
  params?: ParamsOptions;
  query?: {
    limit?: number;
    maxLimit?: number;
    cache?: number | false;
    alwaysPaginate?: boolean;
    softDelete?: boolean;
  };
  serialize?: {
    getMany?: false;
    get?: false;
    create?: false;
    createMany?: false;
    update?: false;
    replace?: false;
    delete?: false;
    recover?: false;
  };
  /**
   * When `true` (default in v2.0+), `InputSanitizer` validates field names
   * against the entity-column allowlist and throws `BadRequestException` on
   * miss. When `false`, falls back to v1 denylist regex only.
   *
   * @deprecated The opt-out (`false`) path is a v2 migration shim. The flag
   *             and the v1 denylist behavior will be removed in v3.
   * @since 2.0.0
   * @default true
   */
  strictSanitization?: boolean;
}
