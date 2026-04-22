import { CrudRequestOptions, getAllowedColumns, JoinResolver, QueryTranslator } from '@nestjs-crud/core';
import { ComparisonOperator, ParsedRequestParams, QuerySort, SCondition } from '@nestjs-crud/request';
import { isArrayFull, isNull, isObject, objKeys } from '@nestjs-crud/util';
import { and, Column, eq, isNull as drizzleIsNull, or, SQL, sql, Table } from 'drizzle-orm';

import { DrizzleQueryTranslatorConfig } from './interfaces';
import { mapOperator } from './operators';

// TYPES-01 debt: Drizzle's $dynamic select-builder type surface is unstable
// across versions; adapters pin `any` here and carry the invariant forward.
type AnyDrizzleSelect = any;

/**
 * Translates `SCondition` search trees into Drizzle `SQL` predicates and
 * composes `$dynamic()` select-builder state (field selection, WHERE,
 * soft-delete filter, eager joins, sort, pagination) via `applyToQuery`.
 *
 * Implements the shared `QueryTranslator` strategy interface from
 * `@nestjs-crud/core`. Introduced in v2.0.0 (Phase 6 ARCH-05 Plan 03) as the
 * Drizzle counterpart of `TypeOrmQueryTranslator`.
 *
 * Config-object ctor (RESEARCH Pattern 1): the translator never imports
 * from `drizzle-crud.service.ts` — not even as `import type` — to preserve
 * the `arch-avoid-circular-deps` invariant. All entity shape required for
 * translation flows in via `DrizzleQueryTranslatorConfig`.
 *
 * D-05b SQLi guard: every sort and filter field path flows through
 * `columnsMap` lookup (own fields) or `joinResolver.getAllowedColumnsFor`
 * (dotted paths), with `onBadRequest` as the throwing sink.
 *
 * @since 2.0.0
 */
export class DrizzleQueryTranslator<T extends Record<string, unknown>> implements QueryTranslator<
  AnyDrizzleSelect,
  SQL
> {
  private readonly db: any;

  private readonly table: Table;

  private readonly entityColumns: string[];

  private readonly entityPrimaryColumns: string[];

  private readonly columnsMap: Record<string, Column>;

  private readonly entityHasDeleteColumn: boolean;

  private readonly softDeleteColumn: Column | null;

  private readonly dbDialect: string;

  private readonly onBadRequest: (msg: string) => void;

  private readonly joinResolver: JoinResolver<AnyDrizzleSelect>;

  constructor(db: any, table: Table, config: DrizzleQueryTranslatorConfig<T>) {
    this.db = db;
    this.table = table;
    this.entityColumns = config.entityColumns;
    this.entityPrimaryColumns = config.entityPrimaryColumns;
    this.columnsMap = config.columnsMap;
    this.entityHasDeleteColumn = config.entityHasDeleteColumn;
    this.softDeleteColumn = config.softDeleteColumn;
    this.dbDialect = config.dbDialect;
    this.onBadRequest = config.onBadRequest;
    this.joinResolver = config.joinResolver;
  }

  public buildWhere(search: SCondition): SQL | undefined {
    if (!isObject(search)) return undefined;
    const keys = objKeys(search);
    if (!keys.length) return undefined;

    // Handle $and
    if (isArrayFull((search as any).$and)) {
      const conditions = ((search as any).$and as SCondition[])
        .map((item) => this.buildWhere(item))
        .filter(Boolean) as SQL[];
      return conditions.length === 1 ? conditions[0] : conditions.length > 1 ? and(...conditions) : undefined;
    }

    // Handle $or
    if (isArrayFull((search as any).$or)) {
      const orConditions = ((search as any).$or as SCondition[])
        .map((item) => this.buildWhere(item))
        .filter(Boolean) as SQL[];

      const otherKeys = keys.filter((k) => k !== '$or');
      if (otherKeys.length === 0) {
        return orConditions.length === 1 ? orConditions[0] : orConditions.length > 1 ? or(...orConditions) : undefined;
      }

      const fieldConditions = otherKeys
        .map((field) => this.buildFieldCondition(field, (search as any)[field]))
        .filter(Boolean) as SQL[];

      const orPart = orConditions.length === 1 ? orConditions[0] : or(...orConditions);
      return and(...fieldConditions, orPart);
    }

    if (keys.length === 1) {
      return this.buildFieldCondition(keys[0], (search as any)[keys[0]]);
    }

    const conditions = keys
      .map((field) => this.buildFieldCondition(field, (search as any)[field]))
      .filter(Boolean) as SQL[];
    return conditions.length === 1 ? conditions[0] : conditions.length > 1 ? and(...conditions) : undefined;
  }

  public applyToQuery(
    query: AnyDrizzleSelect,
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
  ): AnyDrizzleSelect {
    const queryOptions = options?.query ?? {};

    // 1. WHERE (search + soft-delete)
    const searchWhere = this.buildWhere(parsed.search);
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
   * Execute a COUNT against the composed query.
   *
   * RESEARCH §Pitfall 2 — Drizzle's `$dynamic()` builder does not expose a
   * public `.getCount()` method (analogous to TypeORM's). The public API
   * has no way to reflect on a builder's WHERE clause without re-exporting
   * internals, so we rely on `.config.where` — an internal but stable shape
   * across drizzle-orm 0.29.x – 0.45.x. TYPES-01 debt flag: re-evaluate on
   * each drizzle-orm minor bump.
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

  /**
   * Compose the `db.select({...})` column map from the parsed request, route
   * options, and entity columns. Adapter-shaped wrapper around
   * `@nestjs-crud/core`'s `getAllowedColumns` util (cannot flat-delegate to
   * `getSelect` — that returns `string[]` for TypeORM aliases; Drizzle needs
   * `Record<string, Column>`).
   *
   * @since 2.0.0
   */
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
    /* istanbul ignore if */
    if (opts.limit) {
      return opts.maxLimit ? (opts.limit <= opts.maxLimit ? opts.limit : opts.maxLimit) : opts.limit;
    }
    return opts.maxLimit ? opts.maxLimit : null;
  }

  public getSkip(query: ParsedRequestParams, take: number): number | null {
    return query.page && take ? take * (query.page - 1) : query.offset ? query.offset : null;
  }

  private buildFieldCondition(field: string, value: any): SQL | undefined {
    const col = this.columnsMap[field];
    if (!col) {
      // D-05b: reject unknown fields on the filter/search path.
      this.onBadRequest(`Invalid field: '${field}'`);
      return undefined;
    }

    if (!isObject(value)) {
      return isNull(value) ? drizzleIsNull(col) : eq(col, value);
    }

    const operators = objKeys(value);
    if (operators.length === 1) {
      const op = operators[0];
      if (op === '$or' && isObject(value.$or)) {
        return this.buildFieldOperatorOr(col, value.$or);
      }
      return mapOperator(col, op as ComparisonOperator, value[op], this.dbDialect);
    }

    const conditions = operators
      .map((op) => {
        if (op === '$or' && isObject(value.$or)) {
          return this.buildFieldOperatorOr(col, value.$or);
        }
        return mapOperator(col, op as ComparisonOperator, value[op], this.dbDialect);
      })
      .filter(Boolean) as SQL[];

    return conditions.length === 1 ? conditions[0] : and(...conditions);
  }

  private buildFieldOperatorOr(col: Column, orObj: any): SQL | undefined {
    const orKeys = objKeys(orObj);
    if (orKeys.length === 1) {
      return mapOperator(col, orKeys[0] as ComparisonOperator, orObj[orKeys[0]], this.dbDialect);
    }
    const conditions = orKeys
      .map((op) => mapOperator(col, op as ComparisonOperator, orObj[op], this.dbDialect))
      .filter(Boolean) as SQL[];
    return conditions.length > 1 ? or(...conditions) : conditions[0];
  }

  private mapSort(sorts: QuerySort[]): SQL[] {
    const clauses: SQL[] = [];

    for (const s of sorts) {
      if (s.field.includes('.')) {
        // Dotted-path sort: validate via joinResolver allowlist (D-05b).
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
        // Dotted-path sort on joined columns cannot be expressed with the
        // own-table `columnsMap`; emit a raw identifier under the same
        // allowlist-verified name. Consumers wanting a typed column should
        // add an alias-aware resolver in a follow-up (TYPES-01).
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
