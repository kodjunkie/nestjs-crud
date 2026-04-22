/**
 * SEC-03 MikroORM regression: updateOne/replaceOne/deleteOne must run inside
 * em.transactional() at READ_COMMITTED + RequestContext.create(txEm, ...).
 *
 * Without the wrap:
 *   - em.transactional is never called (Test A)
 *   - getEm() never resolves to txEm inside a transactional callback (Test B)
 *
 * RED  — current dev HEAD has no tx wrap; em.transactionalSpy receives 0
 *         calls → assertions fail.
 * GREEN — em.transactional + RequestContext.create(txEm, ...) lands;
 *         spy confirms IsolationLevel.READ_COMMITTED; txEm identity asserted.
 */

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EntityManager, IsolationLevel, RequestContext } from '@mikro-orm/core';

import { MikroOrmCrudService } from '../src/mikro-orm-crud.service';

// ---------------------------------------------------------------------------
// Mock metadata
// ---------------------------------------------------------------------------
const mockProperties: Record<string, any> = {
  id: { name: 'id', fieldNames: ['id'], primary: true, persist: true, kind: undefined },
  name: { name: 'name', fieldNames: ['name'], primary: false, persist: true, kind: undefined },
  email: { name: 'email', fieldNames: ['email'], primary: false, persist: true, kind: undefined },
  deletedAt: { name: 'deletedAt', fieldNames: ['deleted_at'], primary: false, persist: true, kind: undefined },
};

const mockMetadata = {
  properties: mockProperties,
  primaryKeys: ['id'],
  tableName: 'test_users',
  filters: {},
};

// ---------------------------------------------------------------------------
// Minimal CrudRequest factory
// ---------------------------------------------------------------------------
function makeCrudRequest(id: number): any {
  return {
    parsed: {
      fields: [],
      paramsFilter: [{ field: 'id', operator: 'eq', value: id }],
      authPersist: undefined,
      classTransformOptions: undefined,
      search: { id },
      filter: [],
      or: [],
      join: [],
      sort: [],
      limit: undefined,
      offset: undefined,
      page: undefined,
      cache: undefined,
      includeDeleted: 0,
    },
    options: {
      query: { softDelete: false },
      routes: {
        updateOneBase: { allowParamsOverride: false, returnShallow: true },
        replaceOneBase: { allowParamsOverride: false, returnShallow: true },
        deleteOneBase: { returnDeleted: false },
        getOneBase: { allowParamsOverride: false, returnShallow: true },
      },
      params: { id: { field: 'id', type: 'number', primary: true } },
    },
  };
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------
describe('SEC-03 MikroORM — mutations must run inside em.transactional at READ_COMMITTED', () => {
  let service: any;
  let transactionalSpy: jest.Mock;
  let mockEm: any;

  const seedEntity = { id: 1, name: 'original', email: 'original@example.com', deletedAt: null };

  beforeEach(() => {
    transactionalSpy = jest.fn();

    // Mock EntityManager with transactional spy + minimal stubs.
    mockEm = {
      getMetadata: jest.fn().mockReturnValue({ get: jest.fn().mockReturnValue(mockMetadata) }),
      transactional: transactionalSpy,
      // Query builder stubs for getOneOrFail
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        getResult: jest.fn().mockResolvedValue([seedEntity]),
        count: jest.fn().mockResolvedValue(1),
      }),
      assign: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
      create: jest.fn().mockReturnValue(seedEntity),
      remove: jest.fn(),
    };

    // Service with mock em and entity class stub
    class MockEntity {}
    service = new MikroOrmCrudService(mockEm as unknown as EntityManager, MockEntity as any);
  });

  // ---------------------------------------------------------------------------
  // Test A: em.transactional is called with IsolationLevel.READ_COMMITTED
  // ---------------------------------------------------------------------------
  it('updateOne calls em.transactional with READ_COMMITTED isolation', async () => {
    const req = makeCrudRequest(1);
    await service.updateOne(req, { name: 'updated' }).catch(() => {
      /* may throw pre-wrap */
    });
    expect(transactionalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: IsolationLevel.READ_COMMITTED }),
    );
  });

  it('replaceOne calls em.transactional with READ_COMMITTED isolation', async () => {
    const req = makeCrudRequest(1);
    await service.replaceOne(req, { name: 'replaced' }).catch(() => {
      /* may throw pre-wrap */
    });
    expect(transactionalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: IsolationLevel.READ_COMMITTED }),
    );
  });

  it('deleteOne calls em.transactional with READ_COMMITTED isolation', async () => {
    const req = makeCrudRequest(1);
    await service.deleteOne(req).catch(() => {
      /* may throw pre-wrap */
    });
    expect(transactionalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: IsolationLevel.READ_COMMITTED }),
    );
  });

  // ---------------------------------------------------------------------------
  // Test B: txEm identity assertion — the service MUST call
  // RequestContext.create(txEm, ...) inside em.transactional so that
  // MikroORM's ALS-backed em resolves to txEm for the duration of the
  // transactional callback.
  //
  // We verify strict identity by spying on RequestContext.create and
  // asserting the first argument IS txEm (Object.is equality).
  // Pre-wrap: em.transactional is never called → RequestContext.create
  // is never called → capturedTxEm stays null → assertion fails.
  // ---------------------------------------------------------------------------
  it('RequestContext.create is called with txEm (identity assertion — proves tx-wrapping binds writes to txEm)', async () => {
    const txEm = { ...mockEm, _isTxEm: true } as unknown as EntityManager;

    let capturedTxEm: EntityManager | null = null;

    // Simulate em.transactional: invoke the service callback with txEm.
    transactionalSpy.mockImplementation(async (cb: (txEm: EntityManager) => Promise<any>, _opts: any) => {
      return cb(txEm);
    });

    // Spy on RequestContext.create to capture the em arg without running real ALS.
    jest.spyOn(RequestContext, 'create').mockImplementation((em: any, cb: any) => {
      capturedTxEm = em;
      // Invoke cb so the body executes (may throw — that's fine).
      return cb();
    });

    const req = makeCrudRequest(1);
    await service.updateOne(req, { name: 'updated' }).catch(() => {
      /* may throw */
    });

    jest.restoreAllMocks();

    // Without GREEN wrap: transactional/RequestContext.create not called →
    // capturedTxEm stays null → fails.
    // With GREEN wrap: capturedTxEm === txEm (strict identity).
    expect(capturedTxEm).toBe(txEm);
  });
});
