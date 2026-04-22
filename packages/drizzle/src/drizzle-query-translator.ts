import { CrudRequestOptions, QueryTranslator } from '@nestjs-crud/core';
import { ParsedRequestParams, SCondition } from '@nestjs-crud/request';
import { Column, SQL, Table } from 'drizzle-orm';

import { DrizzleQueryTranslatorConfig } from './interfaces';
import { DrizzleFetchHelper } from './query/drizzle-fetch-helper';
import { DrizzleQueryComposer } from './query/drizzle-query-composer';
import { DrizzleWhereBuilder } from './query/drizzle-where-builder';

// TYPES-01 debt: Drizzle's $dynamic select-builder type surface is unstable.
type AnyDrizzleSelect = any;

/**
 * Facade translator composing 3 internal pieces (`DrizzleWhereBuilder`,
 * `DrizzleQueryComposer`, `DrizzleFetchHelper`) behind the stable
 * `QueryTranslator<AnyDrizzleSelect, SQL>` contract. Public API is
 * byte-identical to the pre-6.2 monolithic implementation.
 *
 * @since 2.0.0
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class DrizzleQueryTranslator<T extends Record<string, unknown>> implements QueryTranslator<AnyDrizzleSelect, SQL> {
  private readonly whereBuilder: DrizzleWhereBuilder;

  private readonly queryComposer: DrizzleQueryComposer;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly fetchHelper: DrizzleFetchHelper;

  constructor(db: any, table: Table, config: DrizzleQueryTranslatorConfig<T>) {
    this.whereBuilder = new DrizzleWhereBuilder({
      columnsMap: config.columnsMap,
      dbDialect: config.dbDialect,
      onBadRequest: config.onBadRequest,
    });
    this.queryComposer = new DrizzleQueryComposer({
      db,
      table,
      entityColumns: config.entityColumns,
      entityPrimaryColumns: config.entityPrimaryColumns,
      columnsMap: config.columnsMap,
      entityHasDeleteColumn: config.entityHasDeleteColumn,
      softDeleteColumn: config.softDeleteColumn,
      onBadRequest: config.onBadRequest,
      joinResolver: config.joinResolver,
      whereBuilder: this.whereBuilder,
    });
    this.fetchHelper = new DrizzleFetchHelper({
      onNotFound: /* istanbul ignore next */ () => undefined,
    });
  }

  public buildWhere(search: SCondition): SQL | undefined {
    return this.whereBuilder.build(search);
  }

  public applyToQuery(
    query: AnyDrizzleSelect,
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
  ): AnyDrizzleSelect {
    return this.queryComposer.applyToQuery(query, parsed, options);
  }

  public newQuery(select?: string[]): AnyDrizzleSelect {
    return this.queryComposer.newQuery(select);
  }

  public count(query: AnyDrizzleSelect): Promise<number> {
    return this.queryComposer.count(query);
  }

  public getSelect(parsed: ParsedRequestParams, options: CrudRequestOptions['query']): Record<string, Column> {
    return this.queryComposer.getSelect(parsed, options);
  }

  public getSoftDeleteCondition(): SQL | undefined {
    return this.queryComposer.getSoftDeleteCondition();
  }

  public getTake(query: ParsedRequestParams, options: CrudRequestOptions['query']): number | null {
    return this.queryComposer.getTake(query, options);
  }

  public getSkip(query: ParsedRequestParams, take: number): number | null {
    return this.queryComposer.getSkip(query, take);
  }
}
