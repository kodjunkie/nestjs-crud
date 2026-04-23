/**
 * Drizzle race-condition regression: updateOne/replaceOne/deleteOne must run inside
 * a db.transaction() call with isolationLevel 'read committed'.
 *
 * Without the wrap the read-modify-write pattern is non-atomic: two
 * concurrent requests can read the same stale snapshot and the last
 * writer silently discards the other's update (lost-write race).
 *
 * RED  — current dev HEAD does NOT call `db.transaction`; the spy
 *         receives 0 calls → assertion `toHaveBeenCalled` fails.
 * GREEN — db.transaction wrap + translator.cloneFor(tx) lands; spy
 *         confirms `{ isolationLevel: 'read committed' }` is passed.
 */
import { pgTable, integer, varchar, timestamp, boolean } from 'drizzle-orm/pg-core';

import { DrizzleCrudService } from '../src/drizzle-crud.service';

// ---------------------------------------------------------------------------
// In-memory test table (no real DB needed — we mock db.transaction)
// ---------------------------------------------------------------------------
const testTable = pgTable('test_users', {
  id: integer('id').primaryKey(),
  name: varchar('name', { length: 255 }),
  email: varchar('email', { length: 255 }),
  age: integer('age'),
  isActive: boolean('is_active'),
  deletedAt: timestamp('deleted_at'),
});

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
describe('Drizzle mutations must run inside db.transaction at read committed', () => {
  let service: any;
  let transactionSpy: jest.Mock;

  const seedRow = { id: 1, name: 'original', email: 'original@example.com', age: 0, isActive: true, deletedAt: null };

  beforeEach(() => {
    transactionSpy = jest.fn();

    // Mock db: transaction spy + select/update/delete stubs so the service can
    // run through its read-modify-write path without a real DB.
    const mockDb: any = {
      transaction: transactionSpy,
      select: jest.fn().mockReturnValue({
        from: jest.fn().mockReturnValue({
          $dynamic: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([seedRow]),
            limit: jest.fn().mockReturnThis(),
          }),
        }),
      }),
      update: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([seedRow]),
          }),
        }),
      }),
      delete: jest.fn().mockReturnValue({
        where: jest.fn().mockResolvedValue([]),
      }),
      insert: jest.fn().mockReturnValue({
        values: jest.fn().mockReturnValue({
          returning: jest.fn().mockResolvedValue([seedRow]),
        }),
      }),
    };

    service = new DrizzleCrudService(mockDb, testTable);
  });

  it('updateOne calls db.transaction with isolationLevel read committed', async () => {
    const req = makeCrudRequest(1);
    // Before the wrap lands, updateOne does NOT call db.transaction.
    await service.updateOne(req, { name: 'updated' }).catch(() => {
      /* may throw without real tx */
    });
    expect(transactionSpy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'read committed' }),
    );
  });

  it('replaceOne calls db.transaction with isolationLevel read committed', async () => {
    const req = makeCrudRequest(1);
    await service.replaceOne(req, { name: 'replaced' }).catch(() => {
      /* may throw without real tx */
    });
    expect(transactionSpy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'read committed' }),
    );
  });

  it('deleteOne calls db.transaction with isolationLevel read committed', async () => {
    const req = makeCrudRequest(1);
    await service.deleteOne(req).catch(() => {
      /* may throw without real tx */
    });
    expect(transactionSpy).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ isolationLevel: 'read committed' }),
    );
  });
});
