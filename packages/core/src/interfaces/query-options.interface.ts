import { QueryFields, QuerySort } from '@nestjs-crud/request';

import { QueryFilterOption } from '../types';

export interface QueryOptions {
  allow?: QueryFields;
  exclude?: QueryFields;
  persist?: QueryFields;
  filter?: QueryFilterOption;
  join?: JoinOptions;
  sort?: QuerySort[];
  limit?: number;
  maxLimit?: number;
  cache?: number | false;
  alwaysPaginate?: boolean;
  softDelete?: boolean;
  /**
   * TypeORM split-query opt-in.
   * - 'join' (default): manual leftJoin/innerJoin via JoinResolver. Today's behavior.
   * - 'query': use TypeORM's `setFindOptions({ relations, relationLoadStrategy: 'query' })`
   *   so the ORM emits one query per relation (no Cartesian inflation on deep joins).
   * Other adapters (Drizzle, MikroORM, Prisma) use split queries natively — this option
   * only affects the TypeORM adapter. No-op for non-TypeORM adapters.
   */
  relationLoadStrategy?: 'join' | 'query';

  /**
   * Pagination mode for this route's `getManyBase`. Per-route override of
   * controller-level `CrudOptions.pagination`.
   * - 'offset' (default): offset response shape `{ data, count, total, page, pageCount }`.
   * - 'cursor': opt-in cursor pagination — response shape `{ data, count, cursor: { next, prev } }`.
   *
   * @since 2.2.0
   */
  pagination?: 'offset' | 'cursor';
}

export interface JoinOptions {
  [key: string]: JoinOption;
}

export interface JoinOption {
  alias?: string;
  allow?: QueryFields;
  eager?: boolean;
  exclude?: QueryFields;
  persist?: QueryFields;
  select?: false;
  required?: boolean;
}
