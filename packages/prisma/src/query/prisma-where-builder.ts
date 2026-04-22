import type { WhereBuilder } from '@nestjs-crud/core/query';

import type { SCondition } from '@nestjs-crud/request';

import { mapOperator } from '../operators';

/**
 * @internal — subject to change without semver-major.
 * Compiles an SCondition search tree into a Prisma `where` object.
 *
 * Pure predicate production — no sort / pagination / join / soft-delete concerns
 * (those live in PrismaQueryComposer). Landmine L2 respected: placement of
 * relation-scoped predicates (parent vs include level) is the composer's call.
 *
 * @since 2.0.0
 */

// TYPES-01 debt: Prisma client delegate types are model-specific structural — adapters pin `any` at the piece boundary and carry forward.
export interface PrismaWhereBuilderConfig {
  entityColumns: string[];

  relationFields: string[];

  onBadRequest: (msg: string) => void;
}

export class PrismaWhereBuilder implements WhereBuilder<any, Record<string, any>> {
  private readonly entityColumns: string[];

  private readonly relationFields: string[];

  private readonly onBadRequest: (msg: string) => void;

  constructor(config: PrismaWhereBuilderConfig) {
    this.entityColumns = config.entityColumns;
    this.relationFields = config.relationFields;
    this.onBadRequest = config.onBadRequest;
  }

  public build(search: SCondition): Record<string, any> {
    if (!search || typeof search !== 'object') return {};

    const keys = Object.keys(search as object);
    if (!keys.length) return {};

    const s = search as any;

    // $and
    if (Array.isArray(s.$and)) {
      return { AND: (s.$and as SCondition[]).map((item) => this.build(item)) };
    }

    // $or (pure or mixed)
    if (Array.isArray(s.$or)) {
      const orResult = (s.$or as SCondition[]).map((item) => this.build(item));
      const otherKeys = keys.filter((k) => k !== '$or');

      if (otherKeys.length === 0) {
        return { OR: orResult };
      }

      // Mixed: spread scalar fields + OR key
      const scalarWhere = otherKeys.reduce<Record<string, any>>((acc, field) => {
        return Object.assign(acc, this.buildFieldCondition(field, s[field]));
      }, {});

      return { ...scalarWhere, OR: orResult };
    }

    // Plain field map
    return keys.reduce<Record<string, any>>((acc, field) => {
      return Object.assign(acc, this.buildFieldCondition(field, s[field]));
    }, {});
  }

  private buildFieldCondition(field: string, value: any): Record<string, any> {
    // Dotted-path: relation nesting (spike pattern 1)
    if (field.includes('.')) {
      const dotIdx = field.indexOf('.');
      const relation = field.slice(0, dotIdx);
      const rest = field.slice(dotIdx + 1);

      if (!this.relationFields.includes(relation)) {
        this.onBadRequest(`Unknown relation: ${relation}`);
        return {};
      }

      return { [relation]: this.buildFieldCondition(rest, value) };
    }

    // Validate column/relation (T-09-02-01)
    if (!this.entityColumns.includes(field) && !this.relationFields.includes(field)) {
      this.onBadRequest(`Unknown column: ${field}`);
      return {};
    }

    // Primitive / null shorthand
    if (value === null || value === undefined || typeof value !== 'object') {
      return { [field]: value };
    }

    const opKeys = Object.keys(value);

    // Object without $ operators → recurse (nested relation where)
    if (!opKeys.some((k) => k.startsWith('$'))) {
      return { [field]: this.build(value as SCondition) };
    }

    // Dispatch operator(s)
    return { [field]: this.buildOperatorShape(opKeys, value) };
  }

  private buildOperatorShape(opKeys: string[], value: any): any {
    if (opKeys.length === 1) {
      return this.compileSingleOp(opKeys[0], value[opKeys[0]]);
    }

    // Multiple operators on same field — merge shapes
    return opKeys.reduce<Record<string, any>>((acc, op) => {
      const shape = this.compileSingleOp(op, value[op]);
      return Object.assign(acc, shape);
    }, {});
  }

  private compileSingleOp(sOp: string, arg: any): any {
    const descriptor = mapOperator(sOp);

    if (!descriptor) {
      this.onBadRequest(`Unknown operator: ${sOp}`);
      return {};
    }

    const { key, mode, negate, expand } = descriptor;

    if (expand === 'between') {
      return { gte: (arg as any[])[0], lte: (arg as any[])[1] };
    }

    if (key === 'isnull') {
      return null;
    }

    if (key === 'notnull') {
      return { not: null };
    }

    // $eq short form: emit value directly (not { equals: value })
    if (key === 'equals' && !mode && !negate) {
      return arg;
    }

    if (negate) {
      return { NOT: { [key]: arg, ...(mode ? { mode } : {}) } };
    }

    return { [key]: arg, ...(mode ? { mode } : {}) };
  }
}
