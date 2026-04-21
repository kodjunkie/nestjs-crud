import { CrudRequestOptions, getAllowedColumns, JoinResolver, QueryTranslator } from '@nestjs-crud/core';
import {
  ComparisonOperator,
  ParsedRequestParams,
  QueryFilter,
  QuerySort,
  SCondition,
  SConditionKey,
} from '@nestjs-crud/request';
import { isArrayFull, isNull, isObject, objKeys } from '@nestjs-crud/util';
import { Brackets, DataSourceOptions, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

export interface TypeOrmQueryTranslatorConfig<T extends ObjectLiteral> {
  entityColumnsHash: ObjectLiteral;
  entityHasDeleteColumn: boolean;
  onBadRequest: (msg: string) => void;
  joinResolver: JoinResolver<SelectQueryBuilder<T>>;
}

/**
 * Translates `SCondition` search trees into TypeORM `Brackets` predicates and
 * fully composes `SelectQueryBuilder` state (field selection, WHERE, eager
 * joins, soft-delete filter, sort, pagination, cache) via `applyToQuery`.
 *
 * Implements the shared `QueryTranslator` strategy interface from
 * `@nestjs-crud/core`. Introduced in v2.0.0 as the canonical extension point
 * replacing the deleted `protected` methods `setSearchCondition`, `setAndWhere`,
 * and `setOrWhere` on `TypeOrmCrudService`.
 *
 * In Phase 5 ARCH-04 (v2.0.0) this class absorbed `mapSort` + `getFieldWithAlias`
 * from the service and tightened `mapSort` to assert dotted-path roots against
 * `joinResolver.getAllowedColumnsFor(relation)` — closing the D-05b SQLi vector.
 *
 * @since 2.0.0
 */
export class TypeOrmQueryTranslator<T extends ObjectLiteral> implements QueryTranslator<
  SelectQueryBuilder<T>,
  Brackets
> {
  private readonly repo: Repository<T>;

  private readonly entityColumnsHash: ObjectLiteral;

  private readonly entityHasDeleteColumn: boolean;

  private readonly onBadRequest: (msg: string) => void;

  private readonly joinResolver: JoinResolver<SelectQueryBuilder<T>>;

  constructor(repo: Repository<T>, config: TypeOrmQueryTranslatorConfig<T>) {
    this.repo = repo;
    this.entityColumnsHash = config.entityColumnsHash;
    this.entityHasDeleteColumn = config.entityHasDeleteColumn;
    this.onBadRequest = config.onBadRequest;
    this.joinResolver = config.joinResolver;
  }

  public buildWhere(search: SCondition): Brackets | undefined {
    if (!isObject(search)) return undefined;

    const keys = objKeys(search);
    if (!keys.length) return undefined;

    return new Brackets((qb: SelectQueryBuilder<T>) => {
      this.composeBrackets(qb, search, '$and');
    });
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
    const where = this.buildWhere(parsed.search);
    if (where) query.andWhere(where);

    // 3. Joins (eager + requested)
    const joinOptions = queryOptions.join || {};
    if (objKeys(joinOptions).length) {
      this.joinResolver.applyJoins(query, parsed.join || [], joinOptions);
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

    // 7. Cache
    if (queryOptions.cache && parsed.cache !== 0) {
      query.cache(queryOptions.cache);
    }

    return query;
  }

  public newQuery(select?: string[]): SelectQueryBuilder<T> {
    const qb = this.repo.createQueryBuilder(this.alias);
    if (select && select.length) qb.select(select);
    return qb;
  }

  private get alias(): string {
    return this.repo.metadata.targetName;
  }

  private get dbName(): DataSourceOptions['type'] {
    return this.repo.metadata.connection.options.type;
  }

  private get entityColumns(): string[] {
    return this.repo.metadata.columns.map((prop) => (prop.embeddedMetadata ? prop.propertyPath : prop.propertyName));
  }

  private get entityPrimaryColumns(): string[] {
    return this.repo.metadata.columns.filter((prop) => prop.isPrimary).map((prop) => prop.propertyName);
  }

  private composeBrackets(builder: SelectQueryBuilder<T>, search: SCondition, condition: SConditionKey = '$and'): void {
    /* istanbul ignore else */
    if (!isObject(search)) return;

    const keys = objKeys(search);
    /* istanbul ignore else */
    if (!keys.length) return;

    if (isArrayFull(search.$and)) {
      this.handleAndConditions(builder, search.$and, condition);
    } else if (isArrayFull(search.$or)) {
      this.handleOrConditions(builder, search, keys, condition);
    } else {
      this.handleFieldConditions(builder, search, keys, condition);
    }
  }

  private builderAddBrackets(builder: SelectQueryBuilder<T>, condition: SConditionKey, brackets: Brackets): void {
    if (condition === '$and') {
      builder.andWhere(brackets);
    } else {
      builder.orWhere(brackets);
    }
  }

  private builderSetWhere(
    builder: SelectQueryBuilder<T>,
    condition: SConditionKey,
    field: string,
    value: any,
    operator: ComparisonOperator = '$eq',
  ): void {
    const time = process.hrtime();
    const index = `${field}${time[0]}${time[1]}`;
    const cond: QueryFilter = { field, operator: isNull(value) ? '$isnull' : operator, value };
    const { str, params } = this.mapOperatorsToQuery(cond, index);

    if (condition === '$and') {
      builder.andWhere(str, params);
    } else {
      builder.orWhere(str, params);
    }
  }

  private setSearchFieldObjectCondition(
    builder: SelectQueryBuilder<T>,
    condition: SConditionKey,
    field: string,
    object: any,
  ): void {
    /* istanbul ignore else */
    if (isObject(object)) {
      const operators = objKeys(object);

      if (operators.length === 1) {
        const operator = operators[0] as ComparisonOperator;
        const value = object[operator];

        if (isObject(object.$or)) {
          const orKeys = objKeys(object.$or);
          this.setSearchFieldObjectCondition(builder, orKeys.length === 1 ? condition : '$or', field, object.$or);
        } else {
          this.builderSetWhere(builder, condition, field, value, operator);
        }
      } else {
        /* istanbul ignore else */
        if (operators.length > 1) {
          this.builderAddBrackets(
            builder,
            condition,
            new Brackets((qb: SelectQueryBuilder<T>) => {
              operators.forEach((operator: ComparisonOperator) => {
                const value = object[operator];

                if (operator !== '$or') {
                  this.builderSetWhere(qb, condition, field, value, operator);
                } else {
                  const orKeys = objKeys(object.$or);

                  if (orKeys.length === 1) {
                    this.setSearchFieldObjectCondition(qb, condition, field, object.$or);
                  } else {
                    this.builderAddBrackets(
                      qb,
                      condition,
                      new Brackets((qb2: SelectQueryBuilder<T>) => {
                        this.setSearchFieldObjectCondition(qb2, '$or', field, object.$or);
                      }),
                    );
                  }
                }
              });
            }),
          );
        }
      }
    }
  }

  private handleAndConditions(
    builder: SelectQueryBuilder<T>,
    conditions: SCondition[],
    parentCondition: SConditionKey,
  ): void {
    if (conditions.length === 1) {
      this.composeBrackets(builder, conditions[0], parentCondition);
    } else {
      this.builderAddBrackets(
        builder,
        parentCondition,
        new Brackets((qb: SelectQueryBuilder<T>) => {
          conditions.forEach((item: SCondition) => {
            this.composeBrackets(qb, item, '$and');
          });
        }),
      );
    }
  }

  private handleOrConditions(
    builder: SelectQueryBuilder<T>,
    search: SCondition,
    keys: string[],
    parentCondition: SConditionKey,
  ): void {
    if (keys.length === 1) {
      if (search.$or.length === 1) {
        this.composeBrackets(builder, search.$or[0], parentCondition);
      } else {
        this.builderAddBrackets(
          builder,
          parentCondition,
          new Brackets((qb: SelectQueryBuilder<T>) => {
            search.$or.forEach((item: SCondition) => {
              this.composeBrackets(qb, item, '$or');
            });
          }),
        );
      }
    } else {
      this.builderAddBrackets(
        builder,
        parentCondition,
        new Brackets((qb: SelectQueryBuilder<T>) => {
          keys.forEach((field: string) => {
            if (field !== '$or') {
              const value = search[field];
              if (!isObject(value)) {
                this.builderSetWhere(qb, '$and', field, value);
              } else {
                this.setSearchFieldObjectCondition(qb, '$and', field, value);
              }
            } else {
              if (search.$or.length === 1) {
                this.composeBrackets(builder, search.$or[0], '$and');
              } else {
                this.builderAddBrackets(
                  qb,
                  '$and',
                  new Brackets((qb2: SelectQueryBuilder<T>) => {
                    search.$or.forEach((item: SCondition) => {
                      this.composeBrackets(qb2, item, '$or');
                    });
                  }),
                );
              }
            }
          });
        }),
      );
    }
  }

  private handleFieldConditions(
    builder: SelectQueryBuilder<T>,
    search: SCondition,
    keys: string[],
    parentCondition: SConditionKey,
  ): void {
    if (keys.length === 1) {
      const field = keys[0];
      const value = search[field];
      if (!isObject(value)) {
        this.builderSetWhere(builder, parentCondition, field, value);
      } else {
        this.setSearchFieldObjectCondition(builder, parentCondition, field, value);
      }
    } else {
      this.builderAddBrackets(
        builder,
        parentCondition,
        new Brackets((qb: SelectQueryBuilder<T>) => {
          keys.forEach((field: string) => {
            const value = search[field];
            if (!isObject(value)) {
              this.builderSetWhere(qb, '$and', field, value);
            } else {
              this.setSearchFieldObjectCondition(qb, '$and', field, value);
            }
          });
        }),
      );
    }
  }

  private mapOperatorsToQuery(cond: QueryFilter, param: any): { str: string; params: ObjectLiteral } {
    const field = this.getFieldWithAlias(cond.field);
    const likeOperator = this.dbName === 'postgres' ? 'ILIKE' : /* istanbul ignore next */ 'LIKE';
    let str: string;
    let params: ObjectLiteral;

    if (cond.operator[0] !== '$') {
      cond.operator = ('$' + cond.operator) as ComparisonOperator;
    }

    switch (cond.operator) {
      case '$eq':
        str = `${field} = :${param}`;
        break;

      case '$ne':
        str = `${field} != :${param}`;
        break;

      case '$gt':
        str = `${field} > :${param}`;
        break;

      case '$lt':
        str = `${field} < :${param}`;
        break;

      case '$gte':
        str = `${field} >= :${param}`;
        break;

      case '$lte':
        str = `${field} <= :${param}`;
        break;

      case '$starts':
        str = `${field} LIKE :${param}`;
        params = { [param]: `${cond.value}%` };
        break;

      case '$ends':
        str = `${field} LIKE :${param}`;
        params = { [param]: `%${cond.value}` };
        break;

      case '$cont':
        str = `${field} LIKE :${param}`;
        params = { [param]: `%${cond.value}%` };
        break;

      case '$excl':
        str = `${field} NOT LIKE :${param}`;
        params = { [param]: `%${cond.value}%` };
        break;

      case '$in':
        this.checkFilterIsArray(cond);
        str = `${field} IN (:...${param})`;
        break;

      case '$notin':
        this.checkFilterIsArray(cond);
        str = `${field} NOT IN (:...${param})`;
        break;

      case '$isnull':
        str = `${field} IS NULL`;
        params = {};
        break;

      case '$notnull':
        str = `${field} IS NOT NULL`;
        params = {};
        break;

      case '$between':
        this.checkFilterIsArray(cond, cond.value.length !== 2);
        str = `${field} BETWEEN :${param}0 AND :${param}1`;
        params = {
          [`${param}0`]: cond.value[0],
          [`${param}1`]: cond.value[1],
        };
        break;

      // case insensitive
      case '$eqL':
        str = `LOWER(${field}) = :${param}`;
        break;

      case '$neL':
        str = `LOWER(${field}) != :${param}`;
        break;

      case '$startsL':
        str = `LOWER(${field}) ${likeOperator} :${param}`;
        params = { [param]: `${cond.value}%` };
        break;

      case '$endsL':
        str = `LOWER(${field}) ${likeOperator} :${param}`;
        params = { [param]: `%${cond.value}` };
        break;

      case '$contL':
        str = `LOWER(${field}) ${likeOperator} :${param}`;
        params = { [param]: `%${cond.value}%` };
        break;

      case '$exclL':
        str = `LOWER(${field}) NOT ${likeOperator} :${param}`;
        params = { [param]: `%${cond.value}%` };
        break;

      case '$inL':
        this.checkFilterIsArray(cond);
        str = `LOWER(${field}) IN (:...${param})`;
        break;

      case '$notinL':
        this.checkFilterIsArray(cond);
        str = `LOWER(${field}) NOT IN (:...${param})`;
        break;

      /* istanbul ignore next */
      default:
        str = `${field} = :${param}`;
        break;
    }

    if (typeof params === 'undefined') {
      params = { [param]: cond.value };
    }

    return { str, params };
  }

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
      params[this.getFieldWithAlias(s.field, true)] = s.order;
    }

    return params;
  }

  private getFieldWithAlias(field: string, sort = false): string {
    /* istanbul ignore next */
    const i = ['mysql', 'mariadb'].includes(this.dbName) ? '`' : '"';
    const cols = field.split('.');

    switch (cols.length) {
      case 1: {
        if (sort) {
          return `${this.alias}.${field}`;
        }

        const dbColName = this.entityColumnsHash[field] !== field ? this.entityColumnsHash[field] : field;

        return `${i}${this.alias}${i}.${i}${dbColName}${i}`;
      }
      case 2:
        if (sort) {
          return field;
        }
        return `${i}${cols[0]}${i}.${i}${cols[1]}${i}`;
      default: {
        const last2 = cols.slice(cols.length - 2, cols.length);
        if (sort) {
          return last2.join('.');
        }
        return `${i}${last2[0]}${i}.${i}${last2[1]}${i}`;
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

  private checkFilterIsArray(cond: QueryFilter, withLength?: boolean): void {
    /* istanbul ignore if */
    if (!Array.isArray(cond.value)) {
      this.onBadRequest(`Invalid column '${cond.field}' value: expected an array`);
    }
    if (!cond.value.length) {
      this.onBadRequest(`Invalid column '${cond.field}' value: array must not be empty`);
    }
    if (withLength) {
      this.onBadRequest(`Invalid column '${cond.field}' value: array length mismatch`);
    }
  }
}
