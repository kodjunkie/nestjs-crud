import { QueryJoin } from '@nestjs-crud/request';

import { JoinOptions } from './query-options.interface';

/**
 * Strategy interface for applying eager + client-requested joins to a query.
 *
 * The reference TypeORM implementation lives in `@nestjs-crud/typeorm`.
 *
 * @since 2.0.0
 */
export interface JoinResolver<Q> {
  /**
   * Apply eager and client-requested joins to the query, returning the
   * (possibly mutated) query for chaining.
   */
  applyJoins(query: Q, joins: QueryJoin[], joinOptions: JoinOptions): Q;

  /**
   * Return the allowed column name set for a given relation (or alias), used
   * by translators to enforce the dotted-path sort allowlist (SQLi mitigation).
   * Returns an empty Set if the relation is unknown — callers must check
   * `.size` and reject before letting the identifier reach the SQL builder.
   *
   * @since 2.0.0
   */
  getAllowedColumnsFor(field: string): ReadonlySet<string>;
}
