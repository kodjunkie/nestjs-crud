/**
 * @description Regression spec for `MikroOrmFetchHelper` thunk contract.
 *
 * Asserts the di-scope-awareness contract: the ctor takes `getEm: () => EntityManager`
 * as a THUNK (not a captured em). Every call that needs em re-invokes the thunk —
 * so if the backing `em` reference is mutated between calls, subsequent calls see
 * the new em. A captured `em` field would freeze the identity map across requests,
 * re-introducing the cross-request pollution defect this pattern was introduced to
 * prevent.
 *
 * @since 2.0.0
 * @see packages/mikro-orm/src/query/mikro-orm-fetch-helper.ts
 */
import { EntitySchema } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/sqlite';

import { MikroOrmFetchHelper } from '../src/query/mikro-orm-fetch-helper';

class TUser {
  id!: number;

  name?: string;
}

const TUserSchema = new EntitySchema<TUser>({
  class: TUser,
  tableName: 'thunk_users',
  properties: {
    id: { primary: true, type: 'number' },
    name: { type: 'string', nullable: true },
  },
});

describe('MikroOrmFetchHelper — getEm thunk contract', () => {
  let orm: MikroORM;

  beforeAll(async () => {
    orm = await MikroORM.init({
      entities: [TUserSchema],
      dbName: ':memory:',
      allowGlobalContext: true,
    });
    await orm.schema.create();
  });

  afterAll(async () => {
    if (orm) await orm.close(true);
  });

  it('re-invokes getEm() on every operation (thunk contract, not captured em)', () => {
    let current = orm.em.fork();
    const calls: unknown[] = [];
    const getEm = (): any => {
      calls.push(current);
      return current;
    };

    const helper = new MikroOrmFetchHelper<TUser>({
      onNotFound: () => undefined,
      getEm,
    });

    // Call 1 — createQueryBuilder triggers getEm() resolution.
    helper.createQueryBuilder(TUser);
    expect(calls.length).toBe(1);

    // Mutate the backing reference.
    current = orm.em.fork();

    // Call 2 — getEm() resolves the NEW em, not the one captured at ctor time.
    helper.createQueryBuilder(TUser);
    expect(calls.length).toBe(2);
    expect(calls[1]).toBe(current);
    expect(calls[0]).not.toBe(calls[1]);
  });

  it('accepts a getEm thunk via ctor config (type-level preservation)', () => {
    const helper = new MikroOrmFetchHelper<TUser>({
      onNotFound: () => undefined,
      getEm: () => orm.em.fork(),
    });
    const qb = helper.createQueryBuilder(TUser);
    expect(qb).toBeDefined();
  });
});
