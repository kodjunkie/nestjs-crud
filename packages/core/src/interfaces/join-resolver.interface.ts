import { QueryJoin } from '@nestjs-crud/request';

import { JoinOptions } from './query-options.interface';

/**
 * Strategy interface for applying eager + client-requested joins to a query.
 *
 * Interface ships in Phase 3; the reference TypeORM implementation is
 * delivered in Phase 4 (ARCH-02). Scaffolded now so Phase 4 can parallelise.
 *
 * @since 2.0.0
 */
export interface JoinResolver<Q> {
  /**
   * Apply eager and client-requested joins to the query, returning the
   * (possibly mutated) query for chaining.
   */
  applyJoins(query: Q, joins: QueryJoin[], joinOptions: JoinOptions): Q;
}
