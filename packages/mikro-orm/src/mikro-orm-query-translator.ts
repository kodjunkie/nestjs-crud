import { CrudRequestOptions, getAllowedColumns, JoinResolver, QueryTranslator } from '@nestjs-crud/core';
import { ComparisonOperator, ParsedRequestParams, QuerySort, SCondition } from '@nestjs-crud/request';
import { hasLength, isArrayFull, isNull, isObject, objKeys } from '@nestjs-crud/util';
import { EntityManager, EntityProperty, FilterQuery } from '@mikro-orm/core';
import type { QueryBuilder } from '@mikro-orm/knex';

import { DbDialect, MikroOrmQueryTranslatorConfig } from './interfaces';
import { mapOperator } from './operators';

/**
 * Translates `SCondition` search trees into MikroORM `FilterQuery` predicates
 * and composes `QueryBuilder` state (field selection, WHERE, soft-delete
 * filter, sort, pagination) via `applyToQuery`.
 *
 * Implements the shared `QueryTranslator` strategy interface from
 * `@nestjs-crud/core`. Introduced in v2.0.0 (Phase 6 ARCH-05 Plan 07) as
 * the MikroORM counterpart of `TypeOrmQueryTranslator` / `DrizzleQueryTranslator`.
 *
 * ### Request-scope invariant (di-scope-awareness — T-06-02)
 *
 * The ctor takes `getEm: () => EntityManager` as its FIRST argument — a
 * thunk, not a captured reference. Every method that needs em access
 * calls `this.getEm()` FRESH. This preserves MikroORM's per-request
 * identity-map semantics: request-scope middleware returns the correct
 * em each call, so writes never go through a stale map. Capturing em at
 * ctor time would re-introduce cross-request identity-map pollution and
 * produce "row was updated by another transaction" errors under load.
 *
 * Subclass consumers that override the translator MUST NOT cache
 * `getEm()` across calls — treat it as a per-call resolution. This is
 * surfaced to consumers in the Phase 11 DOCS-04 migration guide.
 *
 * ### Circular-dep invariant
 *
 * The translator never imports from `mikro-orm-crud.service.ts` — not
 * even as `import type`. All entity shape required for translation
 * flows in via `MikroOrmQueryTranslatorConfig`.
 *
 * ### D-05b SQLi guard
 *
 * Every sort and filter field path flows through `propertiesMap` lookup
 * (own fields) or `joinResolver.getAllowedColumnsFor` (dotted paths),
 * with `onBadRequest` as the throwing sink.
 *
 * @since 2.0.0
 */
export class MikroOrmQueryTranslator<T extends object> implements QueryTranslator<QueryBuilder<T>, FilterQuery<T>> {
  private readonly getEm: () => EntityManager;

  private readonly entityColumns: string[];

  private readonly entityPrimaryColumns: string[];

  private readonly propertiesMap: Record<string, EntityProperty>;

  private readonly entityHasDeleteColumn: boolean;

  private readonly softDeleteColumn: string | null;

  private readonly dbDialect: DbDialect;

  private readonly onBadRequest: (msg: string) => void;

  private readonly joinResolver: JoinResolver<any>;

  constructor(getEm: () => EntityManager, config: MikroOrmQueryTranslatorConfig<T>) {
    this.getEm = getEm;
    this.entityColumns = config.entityColumns;
    this.entityPrimaryColumns = config.entityPrimaryColumns;
    this.propertiesMap = config.propertiesMap;
    this.entityHasDeleteColumn = config.entityHasDeleteColumn;
    this.softDeleteColumn = config.softDeleteColumn;
    this.dbDialect = config.dbDialect;
    this.onBadRequest = config.onBadRequest;
    this.joinResolver = config.joinResolver;
  }

  public buildWhere(search: SCondition): FilterQuery<T> | undefined {
    if (!isObject(search)) return undefined;
    const keys = objKeys(search);
    if (!keys.length) return undefined;

    if (isArrayFull((search as any).$and)) {
      const conditions = ((search as any).$and as SCondition[])
        .map((item) => this.buildWhere(item))
        .filter(Boolean) as FilterQuery<T>[];
      if (!conditions.length) return undefined;
      return (conditions.length === 1 ? conditions[0] : { $and: conditions }) as FilterQuery<T>;
    }

    if (isArrayFull((search as any).$or)) {
      const orConditions = ((search as any).$or as SCondition[])
        .map((item) => this.buildWhere(item))
        .filter(Boolean) as FilterQuery<T>[];

      const otherKeys = keys.filter((k) => k !== '$or');
      if (otherKeys.length === 0) {
        if (!orConditions.length) return undefined;
        return (orConditions.length === 1 ? orConditions[0] : { $or: orConditions }) as FilterQuery<T>;
      }

      const fieldObj = this.buildFieldsCondition(otherKeys, search);
      const orPart = orConditions.length === 1 ? orConditions[0] : ({ $or: orConditions } as any);
      if (!fieldObj) return orPart as FilterQuery<T>;
      return { $and: [fieldObj, orPart] } as FilterQuery<T>;
    }

    const combined = this.buildFieldsCondition(keys, search);
    return combined as FilterQuery<T> | undefined;
  }

  public applyToQuery(
    query: QueryBuilder<T>,
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
  ): QueryBuilder<T> {
    const queryOptions = options?.query ?? {};

    // 1. Field selection
    const fields = this.getSelect(parsed, queryOptions);
    if (fields.length) {
      (query as any).select(fields);
    }

    // 2. WHERE (search + soft-delete)
    const searchWhere = this.buildWhere(parsed.search);
    const softDeleteWhere =
      queryOptions.softDelete && this.entityHasDeleteColumn && parsed.includeDeleted !== 1
        ? this.getSoftDeleteCondition()
        : undefined;

    let where: any;
    if (searchWhere && softDeleteWhere) {
      where = { $and: [searchWhere, softDeleteWhere] };
    } else {
      where = searchWhere || softDeleteWhere;
    }
    if (where && objKeys(where).length) {
      (query as any).where(where);
    }

    // 3. Joins
    const joinOptions = queryOptions.join || {};
    if (objKeys(joinOptions).length) {
      this.joinResolver.applyJoins(query, parsed.join || [], joinOptions);
    }

    // 4. Sort
    const sortInput =
      parsed.sort && parsed.sort.length
        ? parsed.sort
        : queryOptions.sort && queryOptions.sort.length
          ? queryOptions.sort
          : [];
    const orderBy = this.mapSort(sortInput);
    if (objKeys(orderBy).length) {
      (query as any).orderBy(orderBy);
    }

    // 5. Pagination
    const take = this.getTake(parsed, queryOptions);
    if (take !== null && isFinite(take)) {
      (query as any).limit(take);
    }
    const skip = this.getSkip(parsed, take as number);
    if (skip !== null && isFinite(skip)) {
      (query as any).offset(skip);
    }

    return query;
  }

  public newQuery(_select?: string[]): QueryBuilder<T> {
    // QB construction requires `em.createQueryBuilder(entityClass)`. Because
    // entity-class flow belongs to the service (and em must be resolved per
    // request via `this.getEm()`), the service composes the QB and passes it
    // into `applyToQuery`. This enforces the di-scope-awareness invariant:
    // the translator never materialises a builder bound to a stale em.
    throw new Error(
      'MikroOrmQueryTranslator.newQuery is not supported — service must create QB via em.createQueryBuilder(entityClass)',
    );
  }

  public async count(query: QueryBuilder<T>): Promise<number> {
    return (query as any).getCount();
  }

  /**
   * Find one entity or invoke `onNotFound`. Absorbed from
   * `MikroOrmCrudService.getOneOrFail` in Phase 6 Plan 07.
   *
   * Resolves em fresh via `this.getEm()` (di-scope-awareness — T-06-02).
   *
   * @since 2.0.0
   */
  public async findOneOrFail(
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
    opts: { entityClass: any; onNotFound: () => Error },
  ): Promise<T> {
    const em = this.getEm(); // fresh per call (di-scope-awareness)
    const qb = (em as any).createQueryBuilder(opts.entityClass);
    this.applyToQuery(qb, parsed, options);
    (qb as any).limit(1);
    const result = await (qb as any).getSingleResult();
    if (!result) {
      throw opts.onNotFound();
    }
    return result as T;
  }

  public getSelect(parsed: ParsedRequestParams, options: CrudRequestOptions['query']): string[] {
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

    return [...allCols].filter((col) => this.propertiesMap[col]);
  }

  public getSoftDeleteCondition(): Record<string, any> | undefined {
    if (this.entityHasDeleteColumn && this.softDeleteColumn) {
      return { [this.softDeleteColumn]: null };
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

  private buildFieldsCondition(keys: string[], search: any): Record<string, any> | undefined {
    if (keys.length === 1) {
      return this.buildFieldCondition(keys[0], search[keys[0]]);
    }

    const result: Record<string, any> = {};
    let hasAny = false;
    for (const field of keys) {
      const cond = this.buildFieldCondition(field, search[field]);
      if (cond) {
        Object.assign(result, cond);
        hasAny = true;
      }
    }
    return hasAny ? result : undefined;
  }

  private buildFieldCondition(field: string, value: any): Record<string, any> | undefined {
    if (!this.propertiesMap[field]) {
      // D-05b: reject unknown fields on the filter/search path.
      this.onBadRequest(`Invalid field: '${field}'`);
      return undefined;
    }

    if (!isObject(value)) {
      return { [field]: isNull(value) ? null : value };
    }

    const operators = objKeys(value);

    if (operators.length === 1 && operators[0] === '$or' && isObject(value.$or)) {
      const orOps = objKeys(value.$or);
      const orConditions = orOps
        .map((op) => {
          const mapped = mapOperator(field, op as ComparisonOperator, value.$or[op], this.dbDialect);
          return { [field]: mapped };
        })
        .filter(Boolean);
      return orConditions.length === 1 ? orConditions[0] : { $or: orConditions };
    }

    const mapped: Record<string, any> = {};
    for (const op of operators) {
      if (op === '$or' && isObject(value.$or)) {
        continue;
      }
      const result = mapOperator(field, op as ComparisonOperator, value[op], this.dbDialect);
      if (result === null) {
        return { [field]: null };
      }
      if (isObject(result)) {
        Object.assign(mapped, result);
      } else {
        mapped[op] = result;
      }
    }

    return hasLength(objKeys(mapped)) ? { [field]: mapped } : undefined;
  }

  private mapSort(sorts: QuerySort[]): Record<string, 'ASC' | 'DESC'> {
    const orderBy: Record<string, 'ASC' | 'DESC'> = {};

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
        orderBy[s.field] = s.order === 'DESC' ? 'DESC' : 'ASC';
      } else {
        if (!this.propertiesMap[s.field]) {
          this.onBadRequest(`Invalid sort field: '${s.field}'`);
          continue;
        }
        orderBy[s.field] = s.order === 'DESC' ? 'DESC' : 'ASC';
      }
    }

    return orderBy;
  }
}
