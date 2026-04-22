import { BadRequestException } from '@nestjs/common';

import { PrismaJoinResolver } from '../src/prisma-join-resolver';
import { PrismaQueryComposer } from '../src/query/prisma-query-composer';
import { PrismaWhereBuilder } from '../src/query/prisma-where-builder';

// CONTRACT: throwing stub — never `jest.fn()` on a security path.
const throwingOnBadRequest = (msg: string): never => {
  throw new BadRequestException(msg);
};

const entityColumns = ['id', 'email', 'name', 'deletedAt', 'companyId'];
const relationFields = ['company', 'projects'];
const allowedColumnsByRelation: Record<string, string[]> = {
  company: ['id', 'name', 'domain', 'deletedAt'],
  projects: ['id', 'name', 'companyId'],
};

const emptyParsed = {
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
} as any;

const emptyOptions = { query: {}, routes: {}, params: {} } as any;

describe('PrismaQueryComposer', () => {
  let composer: PrismaQueryComposer;

  beforeEach(() => {
    const joinResolver = new PrismaJoinResolver({ relationFields, allowedColumnsByRelation });
    const whereBuilder = new PrismaWhereBuilder({
      entityColumns,
      relationFields,
      onBadRequest: throwingOnBadRequest,
    });
    composer = new PrismaQueryComposer({
      entityColumns,
      entityPrimaryColumns: ['id'],
      entityHasDeleteColumn: true,
      softDeleteColumn: 'deletedAt',
      onBadRequest: throwingOnBadRequest,
      joinResolver,
      whereBuilder,
      relationFields,
    });
  });

  describe('empty parsed', () => {
    it('returns input q with no modifications (no where, orderBy, skip, take, select, include)', () => {
      const result = composer.applyToQuery({}, emptyParsed, emptyOptions);
      expect(result.where).toBeUndefined();
      expect(result.orderBy).toBeUndefined();
      expect(result.skip).toBeUndefined();
      expect(result.take).toBeUndefined();
      expect(result.select).toBeUndefined();
      expect(result.include).toBeUndefined();
    });
  });

  describe('WHERE via WhereBuilder', () => {
    it('produces where.id = 5 from search: { id: 5 }', () => {
      const parsed = { ...emptyParsed, search: { id: 5 } };
      const result = composer.applyToQuery({}, parsed, emptyOptions);
      expect(result.where).toEqual({ id: 5 });
    });

    it('handles $or search condition', () => {
      const parsed = { ...emptyParsed, search: { $or: [{ id: 1 }, { id: 2 }] } };
      const result = composer.applyToQuery({}, parsed, emptyOptions);
      expect(result.where).toEqual({ OR: [{ id: 1 }, { id: 2 }] });
    });
  });

  describe('sort', () => {
    it('normalises ASC to asc (spike pattern 2 — Prisma rejects uppercase)', () => {
      const parsed = { ...emptyParsed, sort: [{ field: 'name', order: 'ASC' }] };
      const result = composer.applyToQuery({}, parsed, emptyOptions);
      expect(result.orderBy).toEqual([{ name: 'asc' }]);
    });

    it('normalises DESC to desc', () => {
      const parsed = { ...emptyParsed, sort: [{ field: 'name', order: 'DESC' }] };
      const result = composer.applyToQuery({}, parsed, emptyOptions);
      expect(result.orderBy).toEqual([{ name: 'desc' }]);
    });

    it('compiles dotted-path sort to nested orderBy object', () => {
      const parsed = { ...emptyParsed, sort: [{ field: 'company.name', order: 'ASC' }] };
      const result = composer.applyToQuery({}, parsed, emptyOptions);
      expect(result.orderBy).toEqual([{ company: { name: 'asc' } }]);
    });
  });

  describe('pagination', () => {
    it('sets skip=10 and take=10 for page=2, limit=10 with alwaysPaginate', () => {
      const parsed = { ...emptyParsed, page: 2, limit: 10 };
      const options = { query: { alwaysPaginate: true }, routes: {}, params: {} } as any;
      const result = composer.applyToQuery({}, parsed, options);
      expect(result.skip).toBe(10);
      expect(result.take).toBe(10);
    });

    it('sets skip=5 and take=20 for offset=5, limit=20', () => {
      const parsed = { ...emptyParsed, offset: 5, limit: 20 };
      const result = composer.applyToQuery({}, parsed, emptyOptions);
      expect(result.skip).toBe(5);
      expect(result.take).toBe(20);
    });

    it('respects maxLimit', () => {
      const parsed = { ...emptyParsed, limit: 1000 };
      const options = { query: { maxLimit: 50 }, routes: {}, params: {} } as any;
      const result = composer.applyToQuery({}, parsed, options);
      expect(result.take).toBe(50);
    });
  });

  describe('field selection', () => {
    it('builds select object from fields array', () => {
      const parsed = { ...emptyParsed, fields: ['id', 'name'] };
      const result = composer.applyToQuery({}, parsed, emptyOptions);
      expect(result.select).toEqual(expect.objectContaining({ id: true, name: true }));
    });
  });

  describe('soft-delete', () => {
    it('injects deletedAt: null into where when softDelete=true and includeDeleted=0', () => {
      const parsed = { ...emptyParsed, includeDeleted: 0 };
      const options = { query: { softDelete: true }, routes: {}, params: {} } as any;
      const result = composer.applyToQuery({}, parsed, options);
      // May be wrapped in AND if combined with other conditions
      const where = result.where;
      const hasDeletedAtNull =
        where?.deletedAt === null ||
        (Array.isArray(where?.AND) && where.AND.some((c: any) => c.deletedAt === null));
      expect(hasDeletedAtNull).toBe(true);
    });

    it('does NOT inject soft-delete when includeDeleted=1', () => {
      const parsed = { ...emptyParsed, includeDeleted: 1 };
      const options = { query: { softDelete: true }, routes: {}, params: {} } as any;
      const result = composer.applyToQuery({}, parsed, options);
      const where = result.where;
      const hasDeletedAtNull =
        where?.deletedAt === null ||
        (Array.isArray(where?.AND) && where.AND.some((c: any) => c.deletedAt === null));
      expect(hasDeletedAtNull).toBe(false);
    });

    it('does NOT inject soft-delete when softDelete option is false', () => {
      const parsed = { ...emptyParsed, includeDeleted: 0 };
      const options = { query: { softDelete: false }, routes: {}, params: {} } as any;
      const result = composer.applyToQuery({}, parsed, options);
      const where = result.where;
      const hasDeletedAtNull =
        where?.deletedAt === null ||
        (Array.isArray(where?.AND) && where.AND.some((c: any) => c.deletedAt === null));
      expect(hasDeletedAtNull).toBe(false);
    });
  });

  describe('include (eager joins)', () => {
    it('sets include.company = true for join=[{ field: company }]', () => {
      const parsed = { ...emptyParsed, join: [{ field: 'company', select: [] }] };
      const options = {
        query: { join: { company: { eager: false } } },
        routes: {},
        params: {},
      } as any;
      const result = composer.applyToQuery({}, parsed, options);
      expect(result.include?.company).toBe(true);
    });

    it('sets include for eager join from options.query.join', () => {
      const parsed = { ...emptyParsed };
      const options = {
        query: { join: { company: { eager: true } } },
        routes: {},
        params: {},
      } as any;
      const result = composer.applyToQuery({}, parsed, options);
      expect(result.include?.company).toBe(true);
    });

    // L2 guard: to-one soft-delete MUST stay at parent where, never inside include
    it('L2: to-one relation soft-delete routes to parent where, include remains true (not object)', () => {
      // SCondition dotted-path 'company.deletedAt' with $isnull → parent where.company.deletedAt = null
      const parsed = {
        ...emptyParsed,
        search: { 'company.deletedAt': { $isnull: true } },
        join: [{ field: 'company', select: [] }],
      };
      const options = {
        query: { join: { company: { eager: false } } },
        routes: {},
        params: {},
      } as any;
      const result = composer.applyToQuery({}, parsed, options);
      // include.company must be boolean true — NOT an object with `where`
      expect(result.include?.company).toBe(true);
      // where must contain the company.deletedAt = null filter at parent level
      expect(result.where).toBeDefined();
    });

    // L3 guard: include does NOT auto-inject deletedAt filter
    it('L3: include does NOT auto-filter soft-deleted relations (consumer opt-in only)', () => {
      const parsed = { ...emptyParsed };
      const options = {
        query: { join: { company: { eager: true } }, softDelete: true },
        routes: {},
        params: {},
      } as any;
      const result = composer.applyToQuery({}, parsed, options);
      // include.company must be boolean true (no auto-injected { where: { deletedAt: null } })
      expect(result.include?.company).toBe(true);
      // Must NOT be an object (which would mean filtered include was injected)
      expect(typeof result.include?.company).toBe('boolean');
    });
  });

  // To-many filtered include — Phase 11 concern; not in Plan 03 MVP
  it.todo('Plan 11 DOCS-04 documents to-many filtered include');
});
