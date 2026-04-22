import type { WhereBuilder } from '@nestjs-crud/core/query';
import { ComparisonOperator, SCondition } from '@nestjs-crud/request';
import { hasLength, isArrayFull, isNull, isObject, objKeys } from '@nestjs-crud/util';
import { EntityProperty, FilterQuery } from '@mikro-orm/core';
import type { QueryBuilder } from '@mikro-orm/knex';

import { DbDialect } from '../interfaces';
import { mapOperator } from '../operators';

export interface MikroOrmWhereBuilderConfig {
  propertiesMap: Record<string, EntityProperty>;
  dbDialect: DbDialect;
  onBadRequest: (msg: string) => void;
}

/**
 * Adapter-internal `WhereBuilder<QueryBuilder<T>, FilterQuery<T>>` implementation.
 *
 * Compiles an `SCondition` search tree into a MikroORM `FilterQuery` predicate.
 * Pure predicate production — no sort / pagination / join / soft-delete concerns
 * (those live in `MikroOrmQueryComposer`). Does NOT touch `joinResolver` —
 * D-05b SQLi invariant is concentrated in the composer.
 *
 * Does NOT hold any `em` reference (T-06-02: em is only needed by FetchHelper).
 *
 * @internal — subject to change without semver-major (D-03 / §api-versioning).
 * @since 2.0.0
 */
export class MikroOrmWhereBuilder<T extends object> implements WhereBuilder<QueryBuilder<T>, FilterQuery<T>> {
  private readonly propertiesMap: Record<string, EntityProperty>;

  private readonly dbDialect: DbDialect;

  private readonly onBadRequest: (msg: string) => void;

  constructor(config: MikroOrmWhereBuilderConfig) {
    this.propertiesMap = config.propertiesMap;
    this.dbDialect = config.dbDialect;
    this.onBadRequest = config.onBadRequest;
  }

  public build(search: SCondition): FilterQuery<T> | undefined {
    if (!isObject(search)) return undefined;
    const keys = objKeys(search);
    if (!keys.length) return undefined;

    if (isArrayFull((search as any).$and)) {
      const conditions = ((search as any).$and as SCondition[])
        .map((item) => this.build(item))
        .filter(Boolean) as FilterQuery<T>[];
      if (!conditions.length) return undefined;
      return (conditions.length === 1 ? conditions[0] : { $and: conditions }) as FilterQuery<T>;
    }

    if (isArrayFull((search as any).$or)) {
      const orConditions = ((search as any).$or as SCondition[])
        .map((item) => this.build(item))
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
}
