import type { WhereBuilder } from '@nestjs-crud/core/query';
import { ComparisonOperator, QueryFilter, SCondition, SConditionKey } from '@nestjs-crud/request';
import { isArrayFull, isNull, isObject, objKeys } from '@nestjs-crud/util';
import { Brackets, DataSourceOptions, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

export interface TypeOrmWhereBuilderConfig<T extends ObjectLiteral> {
  repo: Repository<T>;
  entityColumnsHash: ObjectLiteral;
  onBadRequest: (msg: string) => void;
}

/**
 * Adapter-internal `WhereBuilder<SelectQueryBuilder<T>, Brackets>` implementation.
 *
 * Compiles an `SCondition` search tree into a TypeORM `Brackets` predicate.
 * Pure predicate production — no sort / pagination / join / soft-delete concerns
 * (those live in `TypeOrmQueryComposer`). Does NOT touch the `joinResolver` —
 * the SQLi invariant is concentrated in the composer.
 *
 * @internal — subject to change without semver-major.
 * @since 2.0.0
 */
export class TypeOrmWhereBuilder<T extends ObjectLiteral> implements WhereBuilder<SelectQueryBuilder<T>, Brackets> {
  private readonly repo: Repository<T>;

  private readonly entityColumnsHash: ObjectLiteral;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly onBadRequest: (msg: string) => void;

  constructor(config: TypeOrmWhereBuilderConfig<T>) {
    this.repo = config.repo;
    this.entityColumnsHash = config.entityColumnsHash;
    this.onBadRequest = config.onBadRequest;
  }

  public build(search: SCondition): Brackets | undefined {
    if (!isObject(search)) return undefined;

    const keys = objKeys(search);
    if (!keys.length) return undefined;

    return new Brackets((qb: SelectQueryBuilder<T>) => {
      this.composeBrackets(qb, search, '$and');
    });
  }

  private get alias(): string {
    return this.repo.metadata.targetName;
  }

  private get dbName(): DataSourceOptions['type'] {
    return this.repo.metadata.connection.options.type;
  }

  private composeBrackets(builder: SelectQueryBuilder<T>, search: SCondition, condition: SConditionKey = '$and'): void {
    /* istanbul ignore else -- defensive guard: search tree validated by `build()` and RequestQueryParser upstream */
    if (!isObject(search)) return;

    const keys = objKeys(search);
    /* istanbul ignore else -- defensive guard: empty-keys case caught by `build()` upstream */
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
    /* istanbul ignore else -- defensive guard: callers always pass an object after `isObject(value)` checks in handle*Conditions */
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
        /* istanbul ignore else -- defensive guard: operators.length === 0 unreachable (objKeys excluded from `length === 1` branch above) */
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
    const likeOperator = this.dbName === 'postgres' ? 'ILIKE' : 'LIKE';
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

      /* istanbul ignore next -- unreachable: ComparisonOperator is a closed union validated by RequestQueryParser; default exists only for TypeScript exhaustiveness */
      default:
        str = `${field} = :${param}`;
        break;
    }

    if (typeof params === 'undefined') {
      params = { [param]: cond.value };
    }

    return { str, params };
  }

  private getFieldWithAlias(field: string, sort = false): string {
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

  private checkFilterIsArray(cond: QueryFilter, withLength?: boolean): void {
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
