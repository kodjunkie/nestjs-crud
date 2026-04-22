/**
 * SEC-03 TypeORM regression: updateOne/replaceOne/deleteOne must run inside
 * a QueryRunner transaction at READ COMMITTED isolation.
 *
 * Without the wrap the read-modify-write pattern is non-atomic: two
 * concurrent requests can read the same stale snapshot and whichever
 * writes last silently discards the other's update (lost-write race).
 *
 * This spec verifies the transactional guarantee directly:
 *   RED  — current dev HEAD does NOT call `queryRunner.startTransaction`;
 *          `startTransaction` spy receives 0 calls → assertion `toHaveBeenCalled` fails.
 *   GREEN — QueryRunner wrap lands; `startTransaction('READ COMMITTED')` called
 *           once per mutation → assertion passes.
 */
import { DataSource, QueryRunner, Repository } from 'typeorm';

import { TypeOrmCrudService } from '../src/typeorm-crud.service';
import { TranslatorEntity, TranslatorRelation } from './__fixture__/translator-entity';

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
        updateOneBase: { allowParamsOverride: false, returnShallow: false },
        replaceOneBase: { allowParamsOverride: false, returnShallow: false },
        deleteOneBase: { returnDeleted: false },
        getOneBase: { allowParamsOverride: false, returnShallow: false },
      },
      params: { id: { field: 'id', type: 'number', primary: true } },
    },
  };
}

// ---------------------------------------------------------------------------
// Spec
// ---------------------------------------------------------------------------
describe('SEC-03 TypeORM — mutations must run inside a QueryRunner transaction', () => {
  let dataSource: DataSource;
  let repo: Repository<TranslatorEntity>;
  let service: TypeOrmCrudService<TranslatorEntity>;
  let startTransactionSpy: jest.Mock;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [TranslatorEntity, TranslatorRelation],
      synchronize: true,
      dropSchema: true,
    });
    await dataSource.initialize();
    repo = dataSource.getRepository(TranslatorEntity);
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  beforeEach(async () => {
    await repo.clear();
    await repo.save(
      repo.create({ id: 1, name: 'original-name', email: 'original@example.com', age: 0, status: null }),
    );
    service = new TypeOrmCrudService<TranslatorEntity>(repo);

    // Spy on createQueryRunner and intercept startTransaction on returned runners.
    const originalCreate = repo.manager.connection.createQueryRunner.bind(
      repo.manager.connection,
    );
    startTransactionSpy = jest.fn();

    jest
      .spyOn(repo.manager.connection, 'createQueryRunner')
      .mockImplementation((...args: any[]) => {
        const qr: QueryRunner = originalCreate(...args);
        const origStart = qr.startTransaction.bind(qr);
        qr.startTransaction = (async (isolation?: string) => {
          startTransactionSpy(isolation);
          return origStart(isolation);
        }) as any;
        return qr;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('updateOne starts a QueryRunner transaction at READ COMMITTED', async () => {
    const req = makeCrudRequest(1);
    await service.updateOne(req, { name: 'updated' } as any);
    expect(startTransactionSpy).toHaveBeenCalledWith('READ COMMITTED');
  });

  it('replaceOne starts a QueryRunner transaction at READ COMMITTED', async () => {
    const req = makeCrudRequest(1);
    await service.replaceOne(req, { name: 'replaced' } as any);
    expect(startTransactionSpy).toHaveBeenCalledWith('READ COMMITTED');
  });

  it('deleteOne starts a QueryRunner transaction at READ COMMITTED', async () => {
    const req = makeCrudRequest(1);
    await service.deleteOne(req);
    expect(startTransactionSpy).toHaveBeenCalledWith('READ COMMITTED');
  });
});
