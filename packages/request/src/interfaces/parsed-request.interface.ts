import { ObjectLiteral } from '@nestjs-crud/util';
import { ClassTransformOptions } from 'class-transformer';
import { QueryFields, QueryFilter, QueryJoin, QuerySort, SCondition } from '../types';

/**
 * Per-request bypass / control flags surfaced from the query string.
 *
 * Distinct from `ParsedRequestParams.cache: number` (TTL override) — `options.cache`
 * is a boolean toggle that adapter FetchHelpers consume to decide whether to call
 * `cacheStrategy.wrap()`. `false` = bypass cache for this read; `true` = use cache;
 * `undefined` = defer to the controller's `@Crud({ query: { cache } })` setting.
 *
 * Wave 2 FetchHelpers honor `options.cache === false` by skipping the wrap call
 * (bypass-read; cached entry is NOT invalidated, TTL keeps running).
 *
 * @since 2.2.0
 */
export interface ParsedRequestOptions {
  /** Bypass-read flag from `?cache=0|1|false|true`. Unknown values silent-ignored. */
  cache?: boolean;
}

export interface ParsedRequestParams {
  fields: QueryFields;
  paramsFilter: QueryFilter[];
  authPersist: ObjectLiteral;
  classTransformOptions: ClassTransformOptions;
  search: SCondition;
  filter: QueryFilter[];
  or: QueryFilter[];
  join: QueryJoin[];
  sort: QuerySort[];
  limit: number;
  offset: number;
  page: number;
  cache: number;
  includeDeleted: number;
  /**
   * Per-request bypass/control flags. Distinct from the numeric `cache` field above:
   * `cache: number` is a TTL override; `options.cache: boolean` is a per-request
   * cache-bypass toggle consumed by adapter FetchHelpers.
   *
   * @since 2.2.0
   */
  options?: ParsedRequestOptions;
}
