import { CrudRequestOptions, QueryTranslator } from '@nestjs-crud/core';
import { ParsedRequestParams, SCondition } from '@nestjs-crud/request';
import { Column, SQL, Table } from 'drizzle-orm';

import { DrizzleClient } from './interfaces/drizzle-client.interface';
import { DrizzleQueryTranslatorConfig } from './interfaces';
import { DrizzleFetchHelper } from './query/drizzle-fetch-helper';
import { DrizzleQueryComposer } from './query/drizzle-query-composer';
import { DrizzleWhereBuilder } from './query/drizzle-where-builder';

// TYPES-01 debt: Drizzle's $dynamic select-builder type surface is unstable.
type AnyDrizzleSelect = any;

/**
 * Default no-op `onNotFound` thunk wired into `DrizzleFetchHelper`.
 *
 * Hoisted to module scope (COVERAGE-01 D-17 sweep, Phase 10 Plan 06) so
 * the previously inline arrow can be unit-tested directly — replaces a
 * coverage pragma that previously sat on the constructor wiring.
 */
export const defaultOnNotFound = (): undefined => undefined;

/**
 * Facade translator composing 3 internal pieces (`DrizzleWhereBuilder`,
 * `DrizzleQueryComposer`, `DrizzleFetchHelper`) behind the stable
 * `QueryTranslator<AnyDrizzleSelect, SQL>` contract. Public API is
 * byte-identical to the pre-6.2 monolithic implementation.
 *
 * @since 2.0.0
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export class DrizzleQueryTranslator<T extends Record<string, unknown>> implements QueryTranslator<
  AnyDrizzleSelect,
  SQL
> {
  private readonly whereBuilder: DrizzleWhereBuilder;

  private readonly queryComposer: DrizzleQueryComposer;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly fetchHelper: DrizzleFetchHelper;

  /** Stored for `cloneFor(tx)` — allows creating a tx-scoped copy. */
  private readonly _db: any;

  private readonly _table: Table;

  private readonly _config: DrizzleQueryTranslatorConfig<T>;

  constructor(db: any, table: Table, config: DrizzleQueryTranslatorConfig<T>) {
    this._db = db;
    this._table = table;
    this._config = config;
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
      onNotFound: defaultOnNotFound,
    });
  }

  /**
   * SEC-03: Returns a new translator sharing the same config but bound to `tx`.
   * All internal pieces (WhereBuilder, QueryComposer, FetchHelper) are rebuilt
   * against `tx` so reads + writes inside the transaction stay scoped.
   *
   * The D-05b SQLi guard in QueryComposer is preserved — it stays centralised
   * in the facade, not duplicated at callsites.
   */
  public cloneFor(tx: DrizzleClient): DrizzleQueryTranslator<T> {
    return new DrizzleQueryTranslator<T>(tx, this._table, this._config);
  }

  /**
   * Returns the underlying db client bound to this translator.
   * Used by the service's internal mutation helpers to issue direct
   * DML (update/insert/delete) scoped to the same db/tx connection.
   */
  public getDb(): DrizzleClient {
    return this._db;
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
