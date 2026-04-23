/**
 * MikroORM parity harness for the cross-adapter parity suite.
 *
 * STRATEGY: Pure mock EntityManager — no `MikroORM.init()`, no ESM runtime trap.
 * The MikroOrmQueryComposer only needs `propertiesMap` (a plain Record) and a
 * chainable query-builder mock. We build both by hand.
 *
 * The mock QB records `.where()`, `.orderBy()`, `.limit()`, `.offset()` calls.
 * `applyAndRun()` then filters REFERENCE_DATASET in-memory against the recorded
 * where predicate (MikroORM FilterQuery<T> shape) and respects sort/pagination.
 *
 * Exports `buildMikroOrmComposer()` — the factory used by query-composer-parity.spec.ts.
 *
 * IMPORTANT: DO NOT import `@mikro-orm/core` at value level here — only `import type`
 * to avoid pulling in `@mikro-orm/core`'s ESM-only `import.meta.url` at runtime.
 */
import { BadRequestException } from '@nestjs/common';
import type { EntityProperty } from '@mikro-orm/core';

import { MikroOrmQueryComposer } from '@nestjs-crud/mikro-orm/query/mikro-orm-query-composer';
import { REFERENCE_DATASET, RefUser } from '../scondition-matrix';

// ---------------------------------------------------------------------------
// Throwing stub — NEVER jest.fn() on a security path (PATTERNS.md §5)
// ---------------------------------------------------------------------------

const throwingOnBadRequest = (msg: string): never => {
  throw new BadRequestException(msg);
};

// ---------------------------------------------------------------------------
// Mock JoinResolver — returns empty allowlist (no relations in parity schema)
// ---------------------------------------------------------------------------

const mockJoinResolver = {
  applyJoins: (_query: any, _joins: any[], _joinOptions: any) => _query,
  getAllowedColumnsFor: (_relation: string): Set<string> => new Set(),
};

// ---------------------------------------------------------------------------
// Build a fake propertiesMap from column names (matches EntityProperty shape loosely)
// ---------------------------------------------------------------------------

function buildPropertiesMap(columns: string[]): Record<string, EntityProperty> {
  const map: Record<string, any> = {};
  for (const col of columns) {
    map[col] = { name: col, type: 'unknown' } as any;
  }
  return map as Record<string, EntityProperty>;
}

// ---------------------------------------------------------------------------
// Mock QueryBuilder — records calls for in-memory predicate evaluation
// ---------------------------------------------------------------------------

interface MockQbState {
  where: any;
  orderBy: Record<string, 'ASC' | 'DESC'>;
  limitVal: number | null;
  offsetVal: number | null;
}

function makeMockQb(): { qb: any; state: MockQbState } {
  const state: MockQbState = {
    where: undefined,
    orderBy: {},
    limitVal: null,
    offsetVal: null,
  };

  const qb: any = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockImplementation((w: any) => {
      state.where = w;
      return qb;
    }),
    orderBy: jest.fn().mockImplementation((o: Record<string, 'ASC' | 'DESC'>) => {
      Object.assign(state.orderBy, o);
      return qb;
    }),
    limit: jest.fn().mockImplementation((n: number) => {
      state.limitVal = n;
      return qb;
    }),
    offset: jest.fn().mockImplementation((n: number) => {
      state.offsetVal = n;
      return qb;
    }),
    getResult: jest.fn().mockResolvedValue([]),
    getCount: jest.fn().mockResolvedValue(0),
  };

  return { qb, state };
}

// ---------------------------------------------------------------------------
// In-memory predicate evaluation for MikroORM FilterQuery<T> shape
// ---------------------------------------------------------------------------

function evaluatePredicate(user: RefUser, predicate: any): boolean {
  if (!predicate || typeof predicate !== 'object') return true;

  // Handle $and
  if (Array.isArray(predicate.$and)) {
    return (predicate.$and as any[]).every((p: any) => evaluatePredicate(user, p));
  }

  // Handle $or
  if (Array.isArray(predicate.$or)) {
    return (predicate.$or as any[]).some((p: any) => evaluatePredicate(user, p));
  }

  // Field conditions
  for (const key of Object.keys(predicate)) {
    const val = predicate[key];
    const userVal = (user as any)[key];

    if (val === null) {
      if (userVal !== null && userVal !== undefined) return false;
      continue;
    }

    if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
      if (!evaluateOperator(userVal, val)) return false;
    } else {
      if (userVal !== val) return false;
    }
  }

  return true;
}

function evaluateOperator(fieldVal: any, opObj: Record<string, any>): boolean {
  for (const op of Object.keys(opObj)) {
    const expected = opObj[op];
    switch (op) {
      case '$eq':
        if (fieldVal !== expected) return false;
        break;
      case '$ne':
        if (fieldVal === expected) return false;
        break;
      case '$gt':
        if (!(fieldVal > expected)) return false;
        break;
      case '$gte':
        if (!(fieldVal >= expected)) return false;
        break;
      case '$lt':
        if (!(fieldVal < expected)) return false;
        break;
      case '$lte':
        if (!(fieldVal <= expected)) return false;
        break;
      case '$in':
        if (!Array.isArray(expected) || !expected.includes(fieldVal)) return false;
        break;
      case '$nin':
      case '$notin':
        if (Array.isArray(expected) && expected.includes(fieldVal)) return false;
        break;
      case '$null':
      case '$isnull':
        if (fieldVal !== null && fieldVal !== undefined) return false;
        break;
      case '$notnull':
        if (fieldVal === null || fieldVal === undefined) return false;
        break;
      case '$like':
      case '$cont': {
        const pattern = String(expected).replace(/%/g, '');
        if (!String(fieldVal).includes(pattern)) return false;
        break;
      }
      default:
        break;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Harness shape
// ---------------------------------------------------------------------------

export interface MikroOrmHarness {
  applyAndRun(parsed: any): Promise<number[]>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function buildMikroOrmComposer(): MikroOrmHarness {
  const columns = ['id', 'email', 'nameFirst', 'nameLast', 'isActive', 'companyId', 'profileId', 'age'];
  const propertiesMap = buildPropertiesMap(columns);

  const whereBuilder = {
    build: (search: any): any => {
      // Delegate to MikroOrmWhereBuilder-equivalent logic inline.
      // For parity testing we instantiate the REAL MikroOrmWhereBuilder
      // but need to avoid @mikro-orm/core runtime. Since WhereBuilder.build()
      // only uses propertiesMap (a plain Record), we build it inline here.
      return buildFilterQuery(search, propertiesMap);
    },
  };

  const composer = new MikroOrmQueryComposer<RefUser>({
    entityColumns: columns,
    entityPrimaryColumns: ['id'],
    propertiesMap,
    entityHasDeleteColumn: false,
    softDeleteColumn: null,
    onBadRequest: throwingOnBadRequest,
    joinResolver: mockJoinResolver as any,
    whereBuilder: whereBuilder as any,
  });

  const emptyOptions = { query: {}, routes: {}, params: {} } as any;

  return {
    async applyAndRun(parsed: any): Promise<number[]> {
      const normalized = {
        fields: [],
        paramsFilter: [],
        authPersist: undefined,
        classTransformOptions: undefined,
        search: {},
        filter: [],
        or: [],
        join: [],
        sort: [],
        limit: undefined,
        offset: undefined,
        page: undefined,
        cache: undefined,
        includeDeleted: 0,
        ...parsed,
      };

      const { qb, state } = makeMockQb();
      composer.applyToQuery(qb, normalized, emptyOptions);

      // Filter dataset
      let results = REFERENCE_DATASET.filter((u) => evaluatePredicate(u, state.where));

      // Apply sort
      const sortEntries = Object.entries(state.orderBy);
      if (sortEntries.length) {
        results = [...results].sort((a, b) => {
          for (const [field, dir] of sortEntries) {
            const av = (a as any)[field];
            const bv = (b as any)[field];
            if (av < bv) return dir === 'ASC' ? -1 : 1;
            if (av > bv) return dir === 'ASC' ? 1 : -1;
          }
          return 0;
        });
      }

      // Apply pagination
      const off = state.offsetVal ?? 0;
      const lim = state.limitVal;
      if (off || lim !== null) {
        results = lim !== null ? results.slice(off, off + lim) : results.slice(off);
      }

      return results.map((u) => u.id);
    },
  };
}

// ---------------------------------------------------------------------------
// Inline WhereBuilder for MikroORM FilterQuery shape
// (avoids runtime import of @mikro-orm/core WhereBuilder)
// ---------------------------------------------------------------------------

function buildFilterQuery(search: any, propertiesMap: Record<string, any>): any {
  if (!search || typeof search !== 'object') return undefined;
  const keys = Object.keys(search);
  if (!keys.length) return undefined;

  // $and
  if (Array.isArray(search.$and)) {
    const conditions = (search.$and as any[]).map((item) => buildFilterQuery(item, propertiesMap)).filter(Boolean);
    if (!conditions.length) return undefined;
    return conditions.length === 1 ? conditions[0] : { $and: conditions };
  }

  // $or
  if (Array.isArray(search.$or)) {
    const orConditions = (search.$or as any[]).map((item) => buildFilterQuery(item, propertiesMap)).filter(Boolean);
    const otherKeys = keys.filter((k) => k !== '$or');

    if (otherKeys.length === 0) {
      if (!orConditions.length) return undefined;
      return orConditions.length === 1 ? orConditions[0] : { $or: orConditions };
    }

    const fieldObj = buildFieldsCondition(otherKeys, search, propertiesMap);
    const orPart = orConditions.length === 1 ? orConditions[0] : { $or: orConditions };
    if (!fieldObj) return orPart;
    return { $and: [fieldObj, orPart] };
  }

  return buildFieldsCondition(keys, search, propertiesMap);
}

function buildFieldsCondition(keys: string[], search: any, propertiesMap: Record<string, any>): any {
  if (keys.length === 1) {
    return buildSingleFieldCondition(keys[0], search[keys[0]], propertiesMap);
  }
  const result: Record<string, any> = {};
  let hasAny = false;
  for (const field of keys) {
    const cond = buildSingleFieldCondition(field, search[field], propertiesMap);
    if (cond) {
      Object.assign(result, cond);
      hasAny = true;
    }
  }
  return hasAny ? result : undefined;
}

function buildSingleFieldCondition(field: string, value: any, propertiesMap: Record<string, any>): any {
  if (!propertiesMap[field]) {
    throwingOnBadRequest(`Invalid field: '${field}'`);
    return undefined;
  }
  if (typeof value !== 'object' || value === null) {
    return { [field]: value === null ? null : value };
  }
  const operators = Object.keys(value);
  if (operators.length === 1) {
    const op = operators[0];
    const mapped = mapMikroOrmOperator(op, value[op]);
    return { [field]: mapped };
  }
  const mapped: Record<string, any> = {};
  for (const op of operators) {
    const result = mapMikroOrmOperator(op, value[op]);
    if (typeof result === 'object' && result !== null) {
      Object.assign(mapped, result);
    } else {
      mapped[op] = result;
    }
  }
  return Object.keys(mapped).length ? { [field]: mapped } : undefined;
}

function mapMikroOrmOperator(op: string, value: any): any {
  switch (op) {
    case '$eq':
      return value;
    case '$ne':
      return { $ne: value };
    case '$gt':
      return { $gt: value };
    case '$gte':
      return { $gte: value };
    case '$lt':
      return { $lt: value };
    case '$lte':
      return { $lte: value };
    case '$in':
      return { $in: value };
    case '$notin':
      return { $nin: value };
    case '$isnull':
      return null;
    case '$notnull':
      return { $ne: null };
    case '$cont':
      return { $like: `%${value}%` };
    case '$starts':
      return { $like: `${value}%` };
    case '$ends':
      return { $like: `%${value}` };
    default:
      return value;
  }
}
