import { ParsedRequestParams, SCondition } from '@nestjs-crud/request';

import { CrudRequestOptions } from './crud-options.interface';

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
   * Apply the full parsed-request semantics to the supplied query:
   * WHERE (search), sort (`sort`), pagination (`page`/`offset`/`limit`),
   * field selection (`fields` + `options.query.persist`), soft-delete
   * filtering (when the entity has a `@DeleteDateColumn` and the request
   * is not in `includeDeleted` mode), and eager joins (`join` options).
   *
   * Returns the (possibly mutated) query for chaining.
   *
   * Adapters MUST NOT execute the query here — execution is a service-layer
   * concern. This method only composes.
   *
   * @since 2.0.0
   */
  applyToQuery(query: Q, parsed: ParsedRequestParams, options: CrudRequestOptions): Q;

  /**
   * Return a fresh, undecorated query rooted at the entity, optionally
   * pre-selecting the supplied column set.
   */
  newQuery(select?: string[]): Q;

  /**
   * Execute a count query against the composed builder. Returns the total
   * row count matching the builder's current WHERE (+ soft-delete) state.
   *
   * Required by all adapters so pagination can be composed at the service
   * layer (`createPageInfo`) without leaking ORM-specific count idioms.
   *
   * @since 2.0.0
   */
  count(query: Q): Promise<number>;
}
