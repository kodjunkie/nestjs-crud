import { RequestQueryBuilderOptions } from '@nestjs-crud/request';

import type { CacheStrategy } from '../cache/cache-strategy.interface';
import { RoutesOptions } from './routes-options.interface';
import { ParamsOptions } from './params-options.interface';
import { AuthGlobalOptions } from './auth-options.interface';

/**
 * Behavior when a wired `CacheStrategy` throws (Redis down, network blip, etc.).
 * - `'fail-fast'` (default) — propagate the error. Surfaces cache outages immediately
 *   so operators notice and fix. Matches v2.1.x behavior; safe default for new consumers.
 * - `'fallback-to-source'` — log and call `fetchFn()` directly. Use in production when
 *   graceful degradation under cache outage is preferred over hard failure.
 *
 * @since 2.2.0
 */
export type CacheErrorPolicy = 'fail-fast' | 'fallback-to-source';

export interface CrudGlobalConfig {
  queryParser?: RequestQueryBuilderOptions;
  auth?: AuthGlobalOptions;
  routes?: RoutesOptions;
  params?: ParamsOptions;
  query?: {
    limit?: number;
    maxLimit?: number;
    cache?: number | false;
    cacheStrategy?: CacheStrategy;
    /**
     * Behavior when `cacheStrategy.wrap()` rejects. Default `'fail-fast'`.
     * @since 2.2.0
     */
    cacheErrorPolicy?: CacheErrorPolicy;
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
}
