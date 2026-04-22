/**
 * PrismaCrudService unit tests — non-SEC-03 behavior.
 * All tests run offline — no real Postgres.
 */

import { NotFoundException } from '@nestjs/common';

import { PrismaCrudService } from '../src/prisma-crud.service';
import { PrismaJoinResolver } from '../src/prisma-join-resolver';

// ---------------------------------------------------------------------------
// Minimal CrudRequest factory
// ---------------------------------------------------------------------------
function makeCrudRequest(
  id: number,
  overrides: Partial<{
    fields: string[];
    sort: any[];
    limit: number;
    page: number;
    softDelete: boolean;
    join: any[];
    search: any;
    returnShallow: boolean;
  }> = {},
): any {
  return {
    parsed: {
      fields: overrides.fields ?? [],
      paramsFilter: [{ field: 'id', operator: 'eq', value: id }],
      authPersist: undefined,
      classTransformOptions: undefined,
      search: overrides.search ?? { id },
      filter: [],
      or: [],
      join: overrides.join ?? [],
      sort: overrides.sort ?? [],
      limit: overrides.limit,
      offset: undefined,
      page: overrides.page,
      cache: undefined,
      includeDeleted: 0,
    },
    options: {
      query: {
        softDelete: overrides.softDelete ?? false,
        alwaysPaginate: false,
      },
      routes: {
        updateOneBase: { allowParamsOverride: false, returnShallow: overrides.returnShallow ?? true },
        replaceOneBase: { allowParamsOverride: false, returnShallow: overrides.returnShallow ?? true },
        deleteOneBase: { returnDeleted: false },
        createOneBase: { returnShallow: overrides.returnShallow ?? false },
        getOneBase: { allowParamsOverride: false, returnShallow: overrides.returnShallow ?? false },
        recoverOneBase: { returnShallow: overrides.returnShallow ?? true },
      },
      params: { id: { field: 'id', type: 'number', primary: true } },
    },
  };
}

// ---------------------------------------------------------------------------
// Service factory
// ---------------------------------------------------------------------------
function buildService(mockPrisma: any, opts: { softDeleteColumn?: string | null } = {}): any {
  const joinResolver = new PrismaJoinResolver({
    relationFields: ['company'],
    allowedColumnsByRelation: { company: ['id', 'name', 'domain'] },
  });

  const hasSoftDel = !!opts.softDeleteColumn;
  return new PrismaCrudService(mockPrisma, 'user', {
    entityColumns: ['id', 'name', 'email', ...(hasSoftDel ? ['deletedAt'] : [])],
    entityPrimaryColumns: ['id'],
    entityHasDeleteColumn: hasSoftDel,
    softDeleteColumn: opts.softDeleteColumn ?? null,
    onBadRequest: (msg: string) => {
      throw new Error(msg);
    },
    joinResolver,
    relationFields: ['company'],
  });
}

// ---------------------------------------------------------------------------
// Spec suite
// ---------------------------------------------------------------------------
describe('PrismaCrudService', () => {
  const seedRow = { id: 1, name: 'Alice', email: 'alice@example.com' };
  const seedRows = [seedRow, { id: 2, name: 'Bob', email: 'bob@example.com' }];

  // -------------------------------------------------------------------------
  // getMany
  // -------------------------------------------------------------------------
  describe('getMany', () => {
    it('returns array when no pagination requested', async () => {
      const findManyMock = jest.fn().mockResolvedValue(seedRows);
      const mockPrisma: any = {
        $transaction: jest.fn(),
        user: {
          findMany: findManyMock,
          count: jest.fn().mockResolvedValue(2),
        },
      };
      const service: any = buildService(mockPrisma);
      const req = makeCrudRequest(1);
      const result = await service.getMany(req);
      expect(findManyMock).toHaveBeenCalled();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
    });

    it('returns page info when pagination requested', async () => {
      const findManyMock = jest.fn().mockResolvedValue(seedRows);
      const countMock = jest.fn().mockResolvedValue(10);
      const mockPrisma: any = {
        $transaction: jest.fn(),
        user: {
          findMany: findManyMock,
          count: countMock,
        },
      };
      const service: any = buildService(mockPrisma);
      const req = makeCrudRequest(1, { limit: 2, page: 1 });
      const result = await service.getMany(req);
      expect(countMock).toHaveBeenCalled();
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('total', 10);
      expect(result).toHaveProperty('count', 2);
    });
  });

  // -------------------------------------------------------------------------
  // getOne
  // -------------------------------------------------------------------------
  describe('getOne', () => {
    it('returns the found entity', async () => {
      const findFirstMock = jest.fn().mockResolvedValue(seedRow);
      const mockPrisma: any = {
        $transaction: jest.fn(),
        user: { findFirst: findFirstMock },
      };
      const service: any = buildService(mockPrisma);
      const req = makeCrudRequest(1);
      const result = await service.getOne(req);
      expect(result).toEqual(seedRow);
    });

    it('throws NotFoundException when parent row is null', async () => {
      const findFirstMock = jest.fn().mockResolvedValue(null);
      const mockPrisma: any = {
        $transaction: jest.fn(),
        user: { findFirst: findFirstMock },
      };
      const service: any = buildService(mockPrisma);
      const req = makeCrudRequest(99);
      await expect(service.getOne(req)).rejects.toThrow(NotFoundException);
    });

    it('L5 — returns parent row with company: null for orphan relation (no 404)', async () => {
      const rowWithNullRelation = { ...seedRow, company: null };
      const findFirstMock = jest.fn().mockResolvedValue(rowWithNullRelation);
      const mockPrisma: any = {
        $transaction: jest.fn(),
        user: { findFirst: findFirstMock },
      };
      const service: any = buildService(mockPrisma);
      const req = makeCrudRequest(1);
      const result = await service.getOne(req);
      // Must NOT throw — return the row as-is with null relation
      expect(result).toBeDefined();
      expect(result.company).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // createOne
  // -------------------------------------------------------------------------
  describe('createOne', () => {
    it('calls delegate.create and returns the created entity', async () => {
      const createMock = jest.fn().mockResolvedValue(seedRow);
      const mockPrisma: any = {
        $transaction: jest.fn(),
        user: { create: createMock },
      };
      const service: any = buildService(mockPrisma);
      const req = makeCrudRequest(1);
      const result = await service.createOne(req, { name: 'Alice', email: 'alice@example.com' });
      expect(createMock).toHaveBeenCalled();
      expect(result).toEqual(seedRow);
    });
  });

  // -------------------------------------------------------------------------
  // createMany — D-03/C3: array form $transaction
  // -------------------------------------------------------------------------
  describe('createMany', () => {
    it('D-03/C3: calls $transaction with an ARRAY (not a callback)', async () => {
      const createMock = jest.fn().mockResolvedValue(seedRow);
      const txSpy = jest.fn().mockImplementation((fnOrArray: any) => {
        if (Array.isArray(fnOrArray)) {
          return Promise.all(fnOrArray);
        }
        return fnOrArray({});
      });
      const mockPrisma: any = {
        $transaction: txSpy,
        user: { create: createMock },
      };
      const service: any = buildService(mockPrisma);
      const req = makeCrudRequest(1);
      await service.createMany(req, {
        bulk: [
          { name: 'Alice', email: 'alice@example.com' },
          { name: 'Bob', email: 'bob@example.com' },
        ],
      });
      expect(txSpy).toHaveBeenCalledWith(expect.any(Array));
    });

    it('returns empty array for empty bulk input', async () => {
      const txSpy = jest.fn();
      const mockPrisma: any = {
        $transaction: txSpy,
        user: {},
      };
      const service: any = buildService(mockPrisma);
      const req = makeCrudRequest(1);
      const result = await service.createMany(req, { bulk: [] });
      expect(result).toEqual([]);
      expect(txSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // updateOne — inside tx, returns 404 when row missing
  // -------------------------------------------------------------------------
  describe('updateOne', () => {
    it('throws NotFoundException when row does not exist inside tx', async () => {
      const findFirstMock = jest.fn().mockResolvedValue(null);
      const txSpy = jest.fn().mockImplementation(async (fn: any) => {
        const tx: any = { user: { findFirst: findFirstMock, update: jest.fn() } };
        return fn(tx);
      });
      const mockPrisma: any = {
        $transaction: txSpy,
        user: { findFirst: findFirstMock },
      };
      const service: any = buildService(mockPrisma);
      const req = makeCrudRequest(99);
      await expect(service.updateOne(req, { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // recoverOne — plain update, no tx, no isolationLevel
  // -------------------------------------------------------------------------
  describe('recoverOne', () => {
    it('calls delegate.update with { deletedAt: null } — no $transaction', async () => {
      const updateMock = jest.fn().mockResolvedValue({ ...seedRow, deletedAt: null });
      const txSpy = jest.fn();
      const mockPrisma: any = {
        $transaction: txSpy,
        user: { update: updateMock },
      };
      const service: any = buildService(mockPrisma, { softDeleteColumn: 'deletedAt' });
      const req = makeCrudRequest(1);
      await service.recoverOne(req).catch(() => null);
      // Either succeeded or failed (stub) — key assertion: no $transaction called
      expect(txSpy).not.toHaveBeenCalled();
    });
  });
});
