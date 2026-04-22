// T-09-02 SEC-03 regression: updateOne/replaceOne/deleteOne MUST wrap read-modify-write
// in prisma.$transaction(async (tx) => ..., { isolationLevel: 'ReadCommitted' }).
// SEC-03 scope excludes recoverOne (single write, no prior read → no race window).
// Matches Phase 8 Plan 04 CONTEXT.md D-02 exactly.

import { PrismaCrudService } from '../src/prisma-crud.service';
import { PrismaJoinResolver } from '../src/prisma-join-resolver';

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
        recoverOneBase: { returnShallow: true },
      },
      params: { id: { field: 'id', type: 'number', primary: true } },
    },
  };
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------
describe('T-09-02 SEC-03 concurrent update race — Prisma SEC-03 regression', () => {
  let service: any;
  let transactionSpy: jest.Mock;
  let userFindFirstMock: jest.Mock;
  let userUpdateMock: jest.Mock;
  let userDeleteMock: jest.Mock;

  const seedRow = { id: 1, name: 'original', email: 'original@example.com' };

  function buildService(mockPrisma: any): any {
    const joinResolver = new PrismaJoinResolver({
      relationFields: ['company'],
      allowedColumnsByRelation: { company: ['id', 'name'] },
    });
    return new PrismaCrudService(mockPrisma, 'user', {
      entityColumns: ['id', 'name', 'email'],
      entityPrimaryColumns: ['id'],
      entityHasDeleteColumn: false,
      softDeleteColumn: null,
      onBadRequest: (msg: string) => { throw new Error(msg); },
      joinResolver,
      relationFields: [],
    });
  }

  beforeEach(() => {
    userFindFirstMock = jest.fn().mockResolvedValue(seedRow);
    userUpdateMock = jest.fn().mockResolvedValue({ ...seedRow, name: 'updated' });
    userDeleteMock = jest.fn().mockResolvedValue(seedRow);

    // transactionSpy: mimics prisma.$transaction(async (tx) => ..., opts)
    // For the interactive (callback) form, immediately invoke the callback with a tx proxy.
    // For the array form, return an array of results.
    transactionSpy = jest.fn().mockImplementation((fnOrArray: any, _opts?: any) => {
      if (typeof fnOrArray === 'function') {
        // Interactive form — invoke with a tx proxy
        const tx: any = {
          user: {
            findFirst: userFindFirstMock,
            update: userUpdateMock,
            delete: userDeleteMock,
          },
        };
        return fnOrArray(tx);
      }
      // Array form — resolve each promise
      return Promise.all(fnOrArray);
    });

    const mockPrisma: any = {
      $transaction: transactionSpy,
      user: {
        findFirst: userFindFirstMock,
        update: userUpdateMock,
        delete: userDeleteMock,
      },
    };

    service = buildService(mockPrisma);
  });

  // -------------------------------------------------------------------------
  // updateOne
  // -------------------------------------------------------------------------
  it('updateOne — calls prisma.$transaction with a callback (interactive form)', async () => {
    const req = makeCrudRequest(1);
    await service.updateOne(req, { name: 'updated' }).catch(() => { /* expected on stub */ });
    expect(transactionSpy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.anything(),
    );
  });

  it('updateOne — passes isolationLevel ReadCommitted', async () => {
    const req = makeCrudRequest(1);
    await service.updateOne(req, { name: 'updated' }).catch(() => { /* ignore */ });
    expect(transactionSpy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'ReadCommitted' }),
    );
  });

  it('updateOne — tx callback reads before writing (findFirst before update)', async () => {
    const callOrder: string[] = [];
    userFindFirstMock.mockImplementation(async () => { callOrder.push('findFirst'); return seedRow; });
    userUpdateMock.mockImplementation(async () => { callOrder.push('update'); return { ...seedRow, name: 'u' }; });

    const req = makeCrudRequest(1);
    await service.updateOne(req, { name: 'u' }).catch(() => { /* ignore */ });

    const ffIdx = callOrder.indexOf('findFirst');
    const upIdx = callOrder.indexOf('update');
    expect(ffIdx).toBeGreaterThanOrEqual(0);
    expect(upIdx).toBeGreaterThan(ffIdx);
  });

  // -------------------------------------------------------------------------
  // replaceOne
  // -------------------------------------------------------------------------
  it('replaceOne — calls prisma.$transaction with a callback (interactive form)', async () => {
    const req = makeCrudRequest(1);
    await service.replaceOne(req, { name: 'replaced' }).catch(() => { /* ignore */ });
    expect(transactionSpy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.anything(),
    );
  });

  it('replaceOne — passes isolationLevel ReadCommitted', async () => {
    const req = makeCrudRequest(1);
    await service.replaceOne(req, { name: 'replaced' }).catch(() => { /* ignore */ });
    expect(transactionSpy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'ReadCommitted' }),
    );
  });

  it('replaceOne — tx callback reads before writing (findFirst before update)', async () => {
    const callOrder: string[] = [];
    userFindFirstMock.mockImplementation(async () => { callOrder.push('findFirst'); return seedRow; });
    userUpdateMock.mockImplementation(async () => { callOrder.push('update'); return { ...seedRow, name: 'r' }; });

    const req = makeCrudRequest(1);
    await service.replaceOne(req, { name: 'r' }).catch(() => { /* ignore */ });

    const ffIdx = callOrder.indexOf('findFirst');
    const upIdx = callOrder.indexOf('update');
    expect(ffIdx).toBeGreaterThanOrEqual(0);
    expect(upIdx).toBeGreaterThan(ffIdx);
  });

  // -------------------------------------------------------------------------
  // deleteOne
  // -------------------------------------------------------------------------
  it('deleteOne — calls prisma.$transaction with a callback (interactive form)', async () => {
    const req = makeCrudRequest(1);
    await service.deleteOne(req).catch(() => { /* ignore */ });
    expect(transactionSpy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.anything(),
    );
  });

  it('deleteOne — passes isolationLevel ReadCommitted', async () => {
    const req = makeCrudRequest(1);
    await service.deleteOne(req).catch(() => { /* ignore */ });
    expect(transactionSpy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'ReadCommitted' }),
    );
  });

  it('deleteOne — tx callback reads before deleting (findFirst before delete)', async () => {
    const callOrder: string[] = [];
    userFindFirstMock.mockImplementation(async () => { callOrder.push('findFirst'); return seedRow; });
    userDeleteMock.mockImplementation(async () => { callOrder.push('delete'); return seedRow; });

    const req = makeCrudRequest(1);
    await service.deleteOne(req).catch(() => { /* ignore */ });

    const ffIdx = callOrder.indexOf('findFirst');
    const delIdx = callOrder.indexOf('delete');
    expect(ffIdx).toBeGreaterThanOrEqual(0);
    expect(delIdx).toBeGreaterThan(ffIdx);
  });

  // -------------------------------------------------------------------------
  // recoverOne — SEC-03 EXCLUSION
  // -------------------------------------------------------------------------
  it('recoverOne — does NOT call prisma.$transaction (SEC-03 excluded — single write, no prior read)', async () => {
    // Setup: service with softDelete enabled
    const userUpdateDirectMock = jest.fn().mockResolvedValue({ ...seedRow, deletedAt: null });
    const localTxSpy = jest.fn();
    const mockPrismaWithSoftDel: any = {
      $transaction: localTxSpy,
      user: {
        findFirst: jest.fn().mockResolvedValue(seedRow),
        update: userUpdateDirectMock,
      },
    };
    const joinResolver = new PrismaJoinResolver({
      relationFields: [],
      allowedColumnsByRelation: {},
    });
    const softDelService: any = new PrismaCrudService(mockPrismaWithSoftDel, 'user', {
      entityColumns: ['id', 'name', 'email', 'deletedAt'],
      entityPrimaryColumns: ['id'],
      entityHasDeleteColumn: true,
      softDeleteColumn: 'deletedAt',
      onBadRequest: (msg: string) => { throw new Error(msg); },
      joinResolver,
      relationFields: [],
    });

    const req = makeCrudRequest(1);
    await softDelService.recoverOne(req).catch(() => { /* ignore */ });

    expect(localTxSpy).not.toHaveBeenCalled();
  });

  it('recoverOne — calls delegate.update directly with { deletedAt: null } (plain write)', async () => {
    const userUpdateDirectMock = jest.fn().mockResolvedValue({ ...seedRow, deletedAt: null });
    const mockPrismaWithSoftDel: any = {
      $transaction: jest.fn(),
      user: {
        findFirst: jest.fn().mockResolvedValue(seedRow),
        update: userUpdateDirectMock,
      },
    };
    const joinResolver = new PrismaJoinResolver({
      relationFields: [],
      allowedColumnsByRelation: {},
    });
    const softDelService: any = new PrismaCrudService(mockPrismaWithSoftDel, 'user', {
      entityColumns: ['id', 'name', 'email', 'deletedAt'],
      entityPrimaryColumns: ['id'],
      entityHasDeleteColumn: true,
      softDeleteColumn: 'deletedAt',
      onBadRequest: (msg: string) => { throw new Error(msg); },
      joinResolver,
      relationFields: [],
    });

    const req = makeCrudRequest(1);
    await softDelService.recoverOne(req).catch(() => { /* ignore */ });

    expect(userUpdateDirectMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });
});
