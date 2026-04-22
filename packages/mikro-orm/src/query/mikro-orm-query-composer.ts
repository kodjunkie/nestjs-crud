import { CrudRequestOptions, getAllowedColumns, JoinResolver } from '@nestjs-crud/core';
import type { QueryComposer, WhereBuilder } from '@nestjs-crud/core/query';
import { ParsedRequestParams, QuerySort } from '@nestjs-crud/request';
import { objKeys } from '@nestjs-crud/util';
import { EntityProperty, FilterQuery } from '@mikro-orm/core';
import type { QueryBuilder } from '@mikro-orm/knex';

export interface MikroOrmQueryComposerConfig<T extends object> {
  entityColumns: string[];
  entityPrimaryColumns: string[];
  propertiesMap: Record<string, EntityProperty>;
  entityHasDeleteColumn: boolean;
  softDeleteColumn: string | null;
  onBadRequest: (msg: string) => void;
  joinResolver: JoinResolver<any>;
  whereBuilder: WhereBuilder<QueryBuilder<T>, FilterQuery<T>>;
}

/**
 * Adapter-internal `QueryComposer<QueryBuilder<T>>` implementation.
 *
 * Applies the full parsed-request semantics to a MikroORM `QueryBuilder<T>`:
 * field selection, WHERE (delegated to the injected `WhereBuilder`), eager /
 * requested joins, soft-delete filter, sort, pagination.
 *
 * **OWNS the D-05b SQLi invariant**: the dotted-path sort branch validates
 * `relation` and `column` against `joinResolver.getAllowedColumnsFor(relation)`
 * before any identifier reaches `orderBy` (MikroORM does not parameterize
 * column identifiers — the allowlist is the only defense).
 *
 * Does NOT hold any `em` reference. No branch in this composer reads
 * `em.getMetadata()` or any other `em.*` call — all entity shape arrives via
 * `propertiesMap` injected through config. `getEm` is therefore NOT threaded
 * into this piece (see §T-06-02 Extensions in 06.2-04-SUMMARY.md).
 *
 * @internal — subject to change without semver-major (D-03 / §api-versioning).
 * @since 2.0.0
 */
export class MikroOrmQueryComposer<T extends object> implements QueryComposer<QueryBuilder<T>> {
  private readonly entityColumns: string[];

  private readonly entityPrimaryColumns: string[];

  private readonly propertiesMap: Record<string, EntityProperty>;

  private readonly entityHasDeleteColumn: boolean;

  private readonly softDeleteColumn: string | null;

  private readonly onBadRequest: (msg: string) => void;

  private readonly joinResolver: JoinResolver<any>;

  private readonly whereBuilder: WhereBuilder<QueryBuilder<T>, FilterQuery<T>>;

  constructor(config: MikroOrmQueryComposerConfig<T>) {
    this.entityColumns = config.entityColumns;
    this.entityPrimaryColumns = config.entityPrimaryColumns;
    this.propertiesMap = config.propertiesMap;
    this.entityHasDeleteColumn = config.entityHasDeleteColumn;
    this.softDeleteColumn = config.softDeleteColumn;
    this.onBadRequest = config.onBadRequest;
    this.joinResolver = config.joinResolver;
    this.whereBuilder = config.whereBuilder;
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
    const searchWhere = this.whereBuilder.build(parsed.search);
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

  /**
   * D-05b SQLi invariant: dotted-path sort fields MUST round-trip through
   * `joinResolver.getAllowedColumnsFor(relation)` before reaching `orderBy`.
   * Single-segment fields assert against `propertiesMap`.
   */
  private mapSort(sorts: QuerySort[]): Record<string, 'ASC' | 'DESC'> {
    const orderBy: Record<string, 'ASC' | 'DESC'> = {};

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
