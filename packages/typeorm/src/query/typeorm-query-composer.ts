import { CrudCacheNotConfiguredError, getAllowedColumns, JoinResolver } from '@nestjs-crud/core';
import type { QueryComposer, WhereBuilder } from '@nestjs-crud/core/query';
import { ParsedRequestParams, QuerySort } from '@nestjs-crud/request';
import { objKeys } from '@nestjs-crud/util';
import { Brackets, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

import type { CrudRequestOptions } from '@nestjs-crud/core';

export interface TypeOrmQueryComposerConfig<T extends ObjectLiteral> {
  repo: Repository<T>;
  entityColumnsHash: ObjectLiteral;
  entityHasDeleteColumn: boolean;
  onBadRequest: (msg: string) => void;
  joinResolver: JoinResolver<SelectQueryBuilder<T>>;
  whereBuilder: WhereBuilder<SelectQueryBuilder<T>, Brackets>;
}

/**
 * Adapter-internal `QueryComposer<SelectQueryBuilder<T>>` implementation.
 *
 * Applies the full parsed-request semantics to a TypeORM `SelectQueryBuilder`:
 * field selection, WHERE (delegated to the injected `WhereBuilder`), eager /
 * requested joins, soft-delete filter, sort, pagination, cache.
 *
 * **OWNS the D-05b SQLi invariant**: the dotted-path sort branch validates
 * `relation` and `column` against `joinResolver.getAllowedColumnsFor(relation)`
 * before any identifier reaches `addOrderBy` (TypeORM does not parameterize
 * column identifiers — the allowlist is the only defense).
 *
 * @internal — subject to change without semver-major (D-03 / §api-versioning).
 * @since 2.0.0
 */
export class TypeOrmQueryComposer<T extends ObjectLiteral> implements QueryComposer<SelectQueryBuilder<T>> {
  private readonly repo: Repository<T>;

  private readonly entityColumnsHash: ObjectLiteral;

  private readonly entityHasDeleteColumn: boolean;

  private readonly onBadRequest: (msg: string) => void;

  private readonly joinResolver: JoinResolver<SelectQueryBuilder<T>>;

  private readonly whereBuilder: WhereBuilder<SelectQueryBuilder<T>, Brackets>;

  constructor(config: TypeOrmQueryComposerConfig<T>) {
    this.repo = config.repo;
    this.entityColumnsHash = config.entityColumnsHash;
    this.entityHasDeleteColumn = config.entityHasDeleteColumn;
    this.onBadRequest = config.onBadRequest;
    this.joinResolver = config.joinResolver;
    this.whereBuilder = config.whereBuilder;
  }

  public applyToQuery(
    query: SelectQueryBuilder<T>,
    parsed: ParsedRequestParams,
    options: CrudRequestOptions,
  ): SelectQueryBuilder<T> {
    const queryOptions = options?.query ?? {};

    // 1. Field selection (skipped silently if metadata not available)
    const select = this.getSelect(parsed, queryOptions);
    if (select.length) {
      query.select(select);
    }

    // 2. WHERE
    const where = this.whereBuilder.build(parsed.search);
    if (where) query.andWhere(where);

    // 3. Joins (eager + requested) — D-02/D-03 amended: strategy switch.
    const joinOptions = queryOptions.join || {};
    if (objKeys(joinOptions).length) {
      const strategy = queryOptions.relationLoadStrategy ?? 'join';
      if (strategy === 'query') {
        // PERF-01 split-query path: translate our JoinOptions + requested joins
        // into FindOptionsRelations<T> and let TypeORM emit per-relation
        // queries via setFindOptions. The manual joinResolver.applyJoins is
        // bypassed here because relationLoadStrategy is honored by TypeORM
        // *only* through setFindOptions (verified against SelectQueryBuilder
        // source — there is no public setRelationLoadStrategy method).
        const relations = this.buildRelationsTree(parsed.join || [], joinOptions);
        if (objKeys(relations).length) {
          query.setFindOptions({
            relations: relations as any,
            relationLoadStrategy: 'query',
          });
        }
      } else {
        this.joinResolver.applyJoins(query, parsed.join || [], joinOptions);
      }
    }

    // 4. Soft-delete
    if (this.entityHasDeleteColumn && queryOptions.softDelete && parsed.includeDeleted === 1) {
      query.withDeleted();
    }

    // 5. Sort
    const sortInput =
      parsed.sort && parsed.sort.length
        ? parsed.sort
        : queryOptions.sort && queryOptions.sort.length
          ? queryOptions.sort
          : [];
    const sortParams = this.mapSort(sortInput);
    const sortKeys = objKeys(sortParams);
    if (sortKeys.length) {
      query.orderBy(sortParams);
    }

    // 6. Pagination
    const take = this.getTake(parsed, queryOptions);
    if (isFinite(take as number)) {
      query.take(take as number);
    }
    const skip = this.getSkip(parsed, take as number);
    if (isFinite(skip as number)) {
      query.skip(skip as number);
    }

    // 7. Cache (PERF-02 D-06 — fail-fast on missing DataSource cache provider)
    if (queryOptions.cache && parsed.cache !== 0) {
      const cacheProvider = this.repo.manager.connection?.queryResultCache;
      if (!cacheProvider) {
        throw new CrudCacheNotConfiguredError();
      }
      query.cache(queryOptions.cache);
    }

    return query;
  }

  private get alias(): string {
    return this.repo.metadata.targetName;
  }

  private get entityColumns(): string[] {
    return this.repo.metadata.columns.map((prop) => (prop.embeddedMetadata ? prop.propertyPath : prop.propertyName));
  }

  private get entityPrimaryColumns(): string[] {
    return this.repo.metadata.columns.filter((prop) => prop.isPrimary).map((prop) => prop.propertyName);
  }

  /**
   * D-05b SQLi invariant: dotted-path sort fields MUST round-trip through
   * `joinResolver.getAllowedColumnsFor(relation)` before reaching `addOrderBy`.
   * Single-segment fields assert against `entityColumnsHash`.
   */
  private mapSort(sort: QuerySort[]): ObjectLiteral {
    const params: ObjectLiteral = {};

    for (const s of sort) {
      if (s.field.includes('.')) {
        // Dotted-path sort: validate the relation (or its leaf alias for
        // nested joins like `company.projects` → alias `projects`) plus
        // column against the join resolver's allowlist. Closes D-05b SQLi
        // vector while preserving legacy behavior where TypeORM's generated
        // SQL aliases nested joins to their final segment name.
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
      } else if (!this.entityColumnsHash[s.field]) {
        this.onBadRequest(`Invalid sort field: '${s.field}'`);
      }
      params[this.getSortFieldWithAlias(s.field)] = s.order;
    }

    return params;
  }

  /**
   * Translate our JoinOptions + requested joins into TypeORM's
   * `FindOptionsRelations<T>` tree for the `relationLoadStrategy: 'query'`
   * branch (PERF-01 / Phase 10 D-02/D-03 amended).
   *
   * Server allowlist (`joinOptions` from `@Crud()`) is the upper bound — only
   * relations declared there are eligible. Within that allowlist we union:
   *   - eager-flagged relations (always loaded), and
   *   - request-side `parsed.join` fields whose top-level segment is in the
   *     allowlist.
   *
   * Dotted paths like `'company.projects'` produce nested objects:
   *   `{ company: { projects: true } }`.
   *
   * @internal — never exported from the package barrel; consumed only by
   * `applyToQuery`'s strategy-aware join branch.
   */
  private buildRelationsTree(
    requestedJoins: NonNullable<ParsedRequestParams['join']>,
    joinOptions: NonNullable<CrudRequestOptions['query']>['join'],
  ): Record<string, any> {
    const allowedKeys = new Set(objKeys(joinOptions || {}));
    const requestedFields = (requestedJoins || []).map((j) => j.field);

    const eagerKeys = objKeys(joinOptions || {}).filter((k) => (joinOptions as any)?.[k]?.eager === true);

    const effective = new Set<string>([
      ...eagerKeys,
      ...requestedFields.filter((f) => {
        // Allow if the full dotted path OR its top-level segment is in allowlist.
        if (allowedKeys.has(f)) return true;
        const top = f.split('.')[0];
        return allowedKeys.has(top);
      }),
    ]);

    const tree: Record<string, any> = {};
    for (const path of effective) {
      const segments = path.split('.');
      let cursor = tree;
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const isLeaf = i === segments.length - 1;
        if (isLeaf) {
          // Preserve any deeper nesting already set by another path.
          cursor[seg] = cursor[seg] && typeof cursor[seg] === 'object' ? cursor[seg] : true;
        } else {
          if (!cursor[seg] || cursor[seg] === true) cursor[seg] = {};
          cursor = cursor[seg];
        }
      }
    }
    return tree;
  }

  private getSortFieldWithAlias(field: string): string {
    const cols = field.split('.');

    switch (cols.length) {
      case 1:
        return `${this.alias}.${field}`;
      case 2:
        return field;
      default: {
        const last2 = cols.slice(cols.length - 2, cols.length);
        return last2.join('.');
      }
    }
  }

  private getSelect(parsed: ParsedRequestParams, options: CrudRequestOptions['query']): string[] {
    const cols = this.entityColumns;
    if (!cols.length) return [];

    const opts = options ?? {};
    const allowed = getAllowedColumns(cols, opts);
    const columns =
      parsed.fields && parsed.fields.length
        ? parsed.fields.filter((field) => allowed.some((col) => field === col))
        : allowed;

    const select = new Set(
      [...(opts.persist && opts.persist.length ? opts.persist : []), ...columns, ...this.entityPrimaryColumns].map(
        (col) => `${this.alias}.${col}`,
      ),
    );

    return Array.from(select);
  }

  private getTake(query: ParsedRequestParams, options: CrudRequestOptions['query']): number | null {
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

  private getSkip(query: ParsedRequestParams, take: number): number | null {
    return query.page && take ? take * (query.page - 1) : query.offset ? query.offset : null;
  }
}
