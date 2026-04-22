import { QueryFields, QuerySort } from '@nestjs-crud/request/lib/types/request-query.types';

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
   * TypeORM split-query opt-in (per Phase 10 D-02).
   * - 'join' (default): manual leftJoin/innerJoin via JoinResolver. Today's behavior.
   * - 'query': use TypeORM's `setFindOptions({ relations, relationLoadStrategy: 'query' })`
   *   so the ORM emits one query per relation (no Cartesian inflation on deep joins).
   * Other adapters (Drizzle, MikroORM, Prisma) use split queries natively — this option
   * only affects the TypeORM adapter (D-04). No-op for non-TypeORM adapters.
   */
  relationLoadStrategy?: 'join' | 'query';
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
