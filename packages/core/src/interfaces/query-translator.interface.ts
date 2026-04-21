import { ParsedRequestParams, SCondition } from '@nestjs-crud/request';

import { CrudRequestOptions } from './crud-request.interface';

/**
 * Strategy interface for translating an `SCondition` search tree and the rest
 * of a parsed request into an ORM-native query.
 *
 * Adapter packages resolve the generic parameters:
 * - `Q` is the ORM-native mutable query / builder (e.g. `SelectQueryBuilder<T>`
 *   for TypeORM, Drizzle's select builder, MikroORM's `FindOptions<T>`).
 * - `W` is the ORM-native WHERE predicate (e.g. TypeORM `Brackets`, Drizzle
 *   `SQL`, MikroORM filter object).
 *
 * `packages/core` never imports ORM types; `Q` and `W` stay opaque here and
 * are concretised only inside adapter packages.
 *
 * @since 2.0.0
 */
export interface QueryTranslator<Q, W> {
  /**
   * Translate an `SCondition` search tree into an ORM-native WHERE predicate.
   * Returns `undefined` when the search tree is empty — the caller is
   * responsible for skipping the WHERE clause in that case.
   */
  buildWhere(search: SCondition): W | undefined;

  /**
   * Apply WHERE, sort, pagination, field selection, and soft-delete filtering
   * to the supplied query. Returns the (possibly mutated) query for chaining.
   */
  applyToQuery(query: Q, parsed: ParsedRequestParams, options: CrudRequestOptions): Q;

  /**
   * Return a fresh, undecorated query rooted at the entity, optionally
   * pre-selecting the supplied column set.
   */
  newQuery(select?: string[]): Q;
}
