/**
 * Prisma parity harness for the cross-adapter parity suite.
 *
 * Pure in-memory mock — no @prisma/client runtime. applyAndRun evaluates
 * the composed `where` tree against REFERENCE_DATASET using evalPrismaWhere,
 * a small interpreter mirroring Prisma's field-filter semantics (11 operators
 * + AND/OR/NOT + mode: 'insensitive'). This matches the MikroORM harness
 * strategy (runtime-free; fast; adapter-isolated).
 *
 * Exports buildPrismaComposer() — factory used by query-composer-parity.spec.ts.
 */
import { BadRequestException } from '@nestjs/common';

import { PrismaWhereBuilder } from '@nestjs-crud/prisma/query/prisma-where-builder';
import { PrismaQueryComposer } from '@nestjs-crud/prisma/query/prisma-query-composer';
import { PrismaJoinResolver } from '@nestjs-crud/prisma/prisma-join-resolver';
import { REFERENCE_DATASET } from '../scondition-matrix';

// ---------------------------------------------------------------------------
// Throwing stub — NEVER jest.fn() on a security path (PATTERNS.md §5)
// ---------------------------------------------------------------------------

const throwingOnBadRequest = (msg: string): never => {
  throw new BadRequestException(msg);
};

// ---------------------------------------------------------------------------
// In-memory Prisma `where` interpreter
// Covers: AND/OR/NOT composition + 11 field-filter operators + mode: 'insensitive'
// ---------------------------------------------------------------------------

function evalPrismaWhere<T extends Record<string, unknown>>(row: T, where: Record<string, unknown>): boolean {
  if (where == null) return true;
  // Logical operators (top-level)
  if ('AND' in where) return (where.AND as any[]).every((w) => evalPrismaWhere(row, w));
  if ('OR' in where) return (where.OR as any[]).some((w) => evalPrismaWhere(row, w));
  if ('NOT' in where) return !evalPrismaWhere(row, where.NOT as Record<string, unknown>);
  // Per-field operator dispatch
  for (const [key, val] of Object.entries(where)) {
    if (key === 'AND' || key === 'OR' || key === 'NOT') continue;
    const rowVal = row[key];
    // Short-form equality: { field: primitive | null }
    if (val === null || typeof val !== 'object') {
      if (rowVal !== val) return false;
      continue;
    }
    // Nested relation object (recursive) — for relation-qualified operators
    if (isPlainObject(val) && !isOperatorShape(val as Record<string, unknown>)) {
      if (!evalPrismaWhere(rowVal as any, val as any)) return false;
      continue;
    }
    // Operator object: { equals, not, gt, gte, lt, lte, in, notIn, contains, startsWith, endsWith, mode }
    const op = val as Record<string, unknown>;
    const mode = (op.mode as string) ?? 'default'; // 'insensitive' → case-fold comparisons
    const cmp = (a: any, b: any) =>
      mode === 'insensitive' && typeof a === 'string' && typeof b === 'string'
        ? a.toLowerCase() === b.toLowerCase()
        : a === b;
    const str = (a: any) => (mode === 'insensitive' && typeof a === 'string' ? a.toLowerCase() : a);
    if ('equals' in op && !cmp(rowVal, op.equals)) return false;
    if ('not' in op && cmp(rowVal, op.not)) return false;
    if ('gt' in op && !((rowVal as any) > (op.gt as any))) return false;
    if ('gte' in op && !((rowVal as any) >= (op.gte as any))) return false;
    if ('lt' in op && !((rowVal as any) < (op.lt as any))) return false;
    if ('lte' in op && !((rowVal as any) <= (op.lte as any))) return false;
    if ('in' in op && !(op.in as any[]).some((v) => cmp(rowVal, v))) return false;
    if ('notIn' in op && (op.notIn as any[]).some((v) => cmp(rowVal, v))) return false;
    if ('contains' in op && !String(str(rowVal)).includes(String(str(op.contains)))) return false;
    if ('startsWith' in op && !String(str(rowVal)).startsWith(String(str(op.startsWith)))) return false;
    if ('endsWith' in op && !String(str(rowVal)).endsWith(String(str(op.endsWith)))) return false;
  }
  return true;
}

function isPlainObject(v: unknown): boolean {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isOperatorShape(v: Record<string, unknown>): boolean {
  const OPS = ['equals', 'not', 'gt', 'gte', 'lt', 'lte', 'in', 'notIn', 'contains', 'startsWith', 'endsWith', 'mode'];
  return Object.keys(v).some((k) => OPS.includes(k));
}

// ---------------------------------------------------------------------------
// Harness shape
// ---------------------------------------------------------------------------

export interface PrismaHarness {
  applyAndRun(parsed: any): Promise<number[]>;

  composer: PrismaQueryComposer;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function buildPrismaComposer(): PrismaHarness {
  const columns = Object.keys(REFERENCE_DATASET[0]) as string[];

  const whereBuilder = new PrismaWhereBuilder({
    entityColumns: columns,
    relationFields: [],
    onBadRequest: throwingOnBadRequest,
  });

  const joinResolver = new PrismaJoinResolver({
    relationFields: [],
    allowedColumnsByRelation: {},
  });

  const composer = new PrismaQueryComposer({
    entityColumns: columns,
    entityPrimaryColumns: ['id'],
    entityHasDeleteColumn: false,
    softDeleteColumn: null,
    onBadRequest: throwingOnBadRequest,
    joinResolver,
    whereBuilder,
    relationFields: [],
  });

  const emptyOptions = { query: {}, routes: {}, params: {} } as any;

  return {
    composer,

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

      // applyToQuery returns { where?, orderBy?, take?, skip? }
      const q = composer.applyToQuery({}, normalized, emptyOptions);

      // Filter dataset in-memory
      let results = [...REFERENCE_DATASET];
      if (q.where && Object.keys(q.where).length) {
        results = results.filter((row) => evalPrismaWhere(row as any, q.where));
      }

      // Apply orderBy
      if (q.orderBy?.length) {
        results = results.sort((a, b) => {
          for (const entry of q.orderBy) {
            for (const [field, dir] of Object.entries(entry)) {
              const av = (a as any)[field];
              const bv = (b as any)[field];
              if (av < bv) return (dir as string) === 'asc' ? -1 : 1;
              if (av > bv) return (dir as string) === 'asc' ? 1 : -1;
            }
          }
          return 0;
        });
      }

      // Apply pagination
      const off = q.skip ?? 0;
      const lim = q.take ?? null;
      if (off || lim !== null) {
        results = lim !== null ? results.slice(off, off + lim) : results.slice(off);
      }

      return results.map((u) => u.id);
    },
  };
}
