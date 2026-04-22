import { CrudRequestOptions, QueryTranslator } from '@nestjs-crud/core';
import { ParsedRequestParams, SCondition } from '@nestjs-crud/request';
import { EntityManager, FilterQuery } from '@mikro-orm/core';
import type { QueryBuilder } from '@mikro-orm/knex';

import { MikroOrmQueryTranslatorConfig } from './interfaces';
import { MikroOrmFetchHelper } from './query/mikro-orm-fetch-helper';
import { MikroOrmQueryComposer } from './query/mikro-orm-query-composer';
import { MikroOrmWhereBuilder } from './query/mikro-orm-where-builder';

/**
 * Facade translator composing 3 internal pieces (`MikroOrmWhereBuilder`,
 * `MikroOrmQueryComposer`, `MikroOrmFetchHelper`) behind the stable
 * `QueryTranslator<QueryBuilder<T>, FilterQuery<T>>` contract. Public API
 * is byte-identical to the pre-6.2 monolithic implementation.
 *
 * T-06-02: `getEm` thunk is threaded into `MikroOrmFetchHelper` (per-call
 * em resolution); `MikroOrmQueryComposer` does NOT receive `getEm` — no
 * branch in its `applyToQuery` reads `em.*` (see §T-06-02 Extensions in
 * 06.2-04-SUMMARY.md).
 *
 * @since 2.0.0
 */
export class MikroOrmQueryTranslator<T extends object> implements QueryTranslator<QueryBuilder<T>, FilterQuery<T>> {
  private readonly whereBuilder: MikroOrmWhereBuilder<T>;

  private readonly composer: MikroOrmQueryComposer<T>;

  private readonly fetchHelper: MikroOrmFetchHelper<T>;

  constructor(getEm: () => EntityManager, config: MikroOrmQueryTranslatorConfig<T>) {
    const { propertiesMap, dbDialect, onBadRequest, joinResolver } = config;
    this.whereBuilder = new MikroOrmWhereBuilder<T>({ propertiesMap, dbDialect, onBadRequest });
    this.composer = new MikroOrmQueryComposer<T>({
      entityColumns: config.entityColumns,
      entityPrimaryColumns: config.entityPrimaryColumns,
      propertiesMap,
      entityHasDeleteColumn: config.entityHasDeleteColumn,
      softDeleteColumn: config.softDeleteColumn,
      onBadRequest,
      joinResolver,
      whereBuilder: this.whereBuilder,
    });
    this.fetchHelper = new MikroOrmFetchHelper<T>({ onNotFound: /* istanbul ignore next */ () => undefined, getEm });
  }

  public buildWhere(search: SCondition): FilterQuery<T> | undefined {
    return this.whereBuilder.build(search);
  }

  public applyToQuery(
    query: QueryBuilder<T>,
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
  ): QueryBuilder<T> {
    return this.composer.applyToQuery(query, parsed, options);
  }

  public newQuery(_select?: string[]): QueryBuilder<T> {
    throw new Error(
      'MikroOrmQueryTranslator.newQuery is not supported — service must create QB via em.createQueryBuilder(entityClass)',
    );
  }

  public count(query: QueryBuilder<T>): Promise<number> {
    return this.fetchHelper.count(query);
  }

  public async findOneOrFail(
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
    opts: { entityClass: any; onNotFound: () => Error },
  ): Promise<T> {
    const qb = this.fetchHelper.createQueryBuilder(opts.entityClass);
    this.composer.applyToQuery(qb, parsed, options);
    (qb as any).limit(1);
    const result = await (qb as any).getSingleResult();
    if (!result) throw opts.onNotFound();
    return result as T;
  }

  public getSelect(parsed: ParsedRequestParams, options: CrudRequestOptions['query']): string[] {
    return this.composer.getSelect(parsed, options);
  }

  public getSoftDeleteCondition(): Record<string, any> | undefined {
    return this.composer.getSoftDeleteCondition();
  }

  public getTake(query: ParsedRequestParams, options: CrudRequestOptions['query']): number | null {
    return this.composer.getTake(query, options);
  }

  public getSkip(query: ParsedRequestParams, take: number): number | null {
    return this.composer.getSkip(query, take);
  }
}
