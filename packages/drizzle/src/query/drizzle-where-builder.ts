import type { WhereBuilder } from '@nestjs-crud/core/query';
import { ComparisonOperator, SCondition } from '@nestjs-crud/request';
import { isArrayFull, isNull, isObject, objKeys } from '@nestjs-crud/util';
import { and, Column, eq, isNull as drizzleIsNull, or, SQL } from 'drizzle-orm';

import { mapOperator } from '../operators';

// TYPES-01 debt: Drizzle's $dynamic select-builder type surface is unstable
// across versions; adapters pin `any` here and carry the invariant forward.
type AnyDrizzleSelect = any;

export interface DrizzleWhereBuilderConfig {
  columnsMap: Record<string, Column>;
  dbDialect: string;
  onBadRequest: (msg: string) => void;
}

/**
 * Adapter-internal `WhereBuilder<AnyDrizzleSelect, SQL | undefined>`.
 *
 * Compiles an `SCondition` search tree into a Drizzle `SQL` predicate. Pure
 * predicate production — no sort / pagination / join / soft-delete concerns
 * (those live in `DrizzleQueryComposer`). Does NOT touch the `joinResolver` —
 * D-05b SQLi invariant is concentrated in the composer.
 *
 * @internal — subject to change without semver-major (D-03 / §api-versioning).
 * @since 2.0.0
 */
export class DrizzleWhereBuilder implements WhereBuilder<AnyDrizzleSelect, SQL | undefined> {
  private readonly columnsMap: Record<string, Column>;

  private readonly dbDialect: string;

  private readonly onBadRequest: (msg: string) => void;

  constructor(config: DrizzleWhereBuilderConfig) {
    this.columnsMap = config.columnsMap;
    this.dbDialect = config.dbDialect;
    this.onBadRequest = config.onBadRequest;
  }

  public build(search: SCondition): SQL | undefined {
    if (!isObject(search)) return undefined;
    const keys = objKeys(search);
    if (!keys.length) return undefined;

    // Handle $and
    if (isArrayFull((search as any).$and)) {
      const conditions = ((search as any).$and as SCondition[])
        .map((item) => this.build(item))
        .filter(Boolean) as SQL[];
      return conditions.length === 1 ? conditions[0] : conditions.length > 1 ? and(...conditions) : undefined;
    }

    // Handle $or
    if (isArrayFull((search as any).$or)) {
      const orConditions = ((search as any).$or as SCondition[])
        .map((item) => this.build(item))
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
}
