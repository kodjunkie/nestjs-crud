import { CrudRequestOptions, getAllowedColumns, JoinResolver } from '@nestjs-crud/core';
import type { QueryComposer, WhereBuilder } from '@nestjs-crud/core/query';
import { ParsedRequestParams, QuerySort } from '@nestjs-crud/request';
import { objKeys } from '@nestjs-crud/util';
import { and, Column, isNull as drizzleIsNull, SQL, sql, Table } from 'drizzle-orm';

// Type debt: Drizzle's $dynamic select-builder type surface is unstable.
type AnyDrizzleSelect = any;

export interface DrizzleQueryComposerConfig {
  db: any;
  table: Table;
  entityColumns: string[];
  entityPrimaryColumns: string[];
  columnsMap: Record<string, Column>;
  entityHasDeleteColumn: boolean;
  softDeleteColumn: Column | null;
  onBadRequest: (msg: string) => void;
  joinResolver: JoinResolver<AnyDrizzleSelect>;
  whereBuilder: WhereBuilder<AnyDrizzleSelect, SQL | undefined>;
}

/**
 * Adapter-internal `QueryComposer<AnyDrizzleSelect>` implementation.
 *
 * Applies parsed-request semantics to a Drizzle `$dynamic()` select-builder:
 * WHERE (delegated to the injected `WhereBuilder`), eager/requested joins,
 * soft-delete, sort, pagination.
 *
 * **OWNS the SQLi invariant**: the dotted-path sort branch validates
 * `relation` + `column` against `joinResolver.getAllowedColumnsFor(relation)`
 * before any identifier reaches `sql.identifier` (Drizzle does NOT
 * parameterize column identifiers — the allowlist is the only defense).
 *
 * **Count-query pitfall:** `count(qb)` extracts WHERE via the internal
 * `.config?.where` shape (stable across drizzle-orm 0.29.x–0.45.x) to
 * avoid double-applying WHERE on the count query. Preserved verbatim
 * from the pre-refactor monolithic translator.
 *
 * @internal — subject to change without semver-major.
 * @since 2.0.0
 */
export class DrizzleQueryComposer implements QueryComposer<AnyDrizzleSelect> {
  private readonly db: any;

  private readonly table: Table;

  private readonly entityColumns: string[];

  private readonly entityPrimaryColumns: string[];

  private readonly columnsMap: Record<string, Column>;

  private readonly entityHasDeleteColumn: boolean;

  private readonly softDeleteColumn: Column | null;

  private readonly onBadRequest: (msg: string) => void;

  private readonly joinResolver: JoinResolver<AnyDrizzleSelect>;

  private readonly whereBuilder: WhereBuilder<AnyDrizzleSelect, SQL | undefined>;

  constructor(config: DrizzleQueryComposerConfig) {
    this.db = config.db;
    this.table = config.table;
    this.entityColumns = config.entityColumns;
    this.entityPrimaryColumns = config.entityPrimaryColumns;
    this.columnsMap = config.columnsMap;
    this.entityHasDeleteColumn = config.entityHasDeleteColumn;
    this.softDeleteColumn = config.softDeleteColumn;
    this.onBadRequest = config.onBadRequest;
    this.joinResolver = config.joinResolver;
    this.whereBuilder = config.whereBuilder;
  }

  public applyToQuery(
    query: AnyDrizzleSelect,
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
  ): AnyDrizzleSelect {
    const queryOptions = options?.query ?? {};

    // 1. WHERE (search + soft-delete)
    const searchWhere = this.whereBuilder.build(parsed.search);
    const softDeleteWhere =
      queryOptions.softDelete && this.entityHasDeleteColumn && parsed.includeDeleted !== 1
        ? this.getSoftDeleteCondition()
        : undefined;

    const allConditions = [searchWhere, softDeleteWhere].filter(Boolean) as SQL[];
    if (allConditions.length) {
      query.where(allConditions.length === 1 ? allConditions[0] : and(...allConditions));
    }

    // 2. Joins (eager + requested)
    const joinOptions = queryOptions.join || {};
    if (objKeys(joinOptions).length) {
      this.joinResolver.applyJoins(query, parsed.join || [], joinOptions);
    }

    // 3. Sort
    const sortInput =
      parsed.sort && parsed.sort.length
        ? parsed.sort
        : queryOptions.sort && queryOptions.sort.length
          ? queryOptions.sort
          : [];
    const sortClauses = this.mapSort(sortInput);
    if (sortClauses.length) {
      query.orderBy(...sortClauses);
    }

    // 4. Pagination
    const take = this.getTake(parsed, queryOptions);
    if (take && isFinite(take)) {
      query.limit(take);
    }
    const skip = this.getSkip(parsed, take as number);
    if (skip && isFinite(skip)) {
      query.offset(skip);
    }

    return query;
  }

  public newQuery(select?: string[]): AnyDrizzleSelect {
    if (select && select.length) {
      const selectMap: Record<string, Column> = {};
      for (const col of select) {
        if (this.columnsMap[col]) {
          selectMap[col] = this.columnsMap[col];
        }
      }
      return this.db.select(selectMap).from(this.table).$dynamic();
    }
    return this.db.select().from(this.table).$dynamic();
  }

  /**
   * Execute a COUNT against a composed query.
   *
   * Drizzle's `$dynamic()` builder does not expose a public `.getCount()`
   * method. The public API has no way to reflect on a builder's WHERE
   * clause without re-exporting internals, so we rely on `.config.where` —
   * an internal but stable shape across drizzle-orm 0.29.x – 0.45.x.
   * Re-evaluate on each drizzle-orm minor bump.
   *
   * @since 2.0.0
   */
  public async count(query: AnyDrizzleSelect): Promise<number> {
    const where = (query as any).config?.where;
    const countQuery = this.db
      .select({ count: sql<number>`count(*)` })
      .from(this.table)
      .$dynamic();
    if (where) {
      countQuery.where(where);
    }
    const result = await countQuery;
    return Number(result[0]?.count ?? 0);
  }

  public getSelect(parsed: ParsedRequestParams, options: CrudRequestOptions['query']): Record<string, Column> {
    const opts = options ?? {};
    const allowed = getAllowedColumns(this.entityColumns, opts);
    const columns =
      parsed.fields && parsed.fields.length
        ? parsed.fields.filter((field) => allowed.some((col) => field === col))
        : allowed;

    const allCols = new Set([
      ...(opts.persist && opts.persist.length ? opts.persist : []),
      ...columns,
      ...this.entityPrimaryColumns,
    ]);

    const selectMap: Record<string, Column> = {};
    for (const col of allCols) {
      if (this.columnsMap[col]) {
        selectMap[col] = this.columnsMap[col];
      }
    }
    return selectMap;
  }

  public getSoftDeleteCondition(): SQL | undefined {
    if (this.entityHasDeleteColumn && this.softDeleteColumn) {
      return drizzleIsNull(this.softDeleteColumn);
    }
    return undefined;
  }

  public getTake(query: ParsedRequestParams, options: CrudRequestOptions['query']): number | null {
    const opts = options ?? {};
    if (query.limit) {
      return opts.maxLimit ? (query.limit <= opts.maxLimit ? query.limit : opts.maxLimit) : query.limit;
    }
    if (opts.limit) {
      return opts.maxLimit ? (opts.limit <= opts.maxLimit ? opts.limit : opts.maxLimit) : opts.limit;
    }
    return opts.maxLimit ? opts.maxLimit : null;
  }

  public getSkip(query: ParsedRequestParams, take: number): number | null {
    return query.page && take ? take * (query.page - 1) : query.offset ? query.offset : null;
  }

  /**
   * SQLi invariant: dotted-path sort fields MUST round-trip through
   * `joinResolver.getAllowedColumnsFor(relation)` before reaching the ORDER BY
   * clause. Single-segment fields assert against `columnsMap`.
   */
  private mapSort(sorts: QuerySort[]): SQL[] {
    const clauses: SQL[] = [];

    for (const s of sorts) {
      if (s.field.includes('.')) {
        const segments = s.field.split('.');
        const relation = segments.slice(0, -1).join('.');
        const column = segments[segments.length - 1];
        const allowed = this.joinResolver.getAllowedColumnsFor(relation);
        if (!allowed.size) {
          this.onBadRequest(`Invalid relation in sort: '${relation}'`);
        }
        if (!allowed.has(column)) {
          this.onBadRequest(`Invalid column '${column}' for relation '${relation}'`);
        }
        clauses.push(
          s.order === 'DESC'
            ? sql`${sql.identifier(relation)}.${sql.identifier(column)} DESC`
            : sql`${sql.identifier(relation)}.${sql.identifier(column)} ASC`,
        );
      } else {
        const col = this.columnsMap[s.field];
        if (!col) {
          this.onBadRequest(`Invalid sort field: '${s.field}'`);
          continue;
        }
        clauses.push(s.order === 'DESC' ? sql`${col} DESC` : sql`${col} ASC`);
      }
    }

    return clauses;
  }
}
