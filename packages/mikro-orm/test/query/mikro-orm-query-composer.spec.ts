/**
 * Composer-level unit spec for `MikroOrmQueryComposer`.
 *
 * Currently scoped to the istanbul-ignore pragma sweep:
 * exercises the `getTake` opts.limit fallback branch that previously
 * carried `/* istanbul ignore if * /`. Mirrors the Drizzle composer's
 * `drizzle-query-composer.spec.ts` structure, adapted to MikroORM's
 * `(query as any).limit(n) / .offset(n)` mock surface.
 *
 * Mock strategy (no DB — pure unit, ESM-runner-compatible):
 *   - `mockQuery` is a hand-rolled QueryBuilder stand-in that records
 *     `.select / .where / .orderBy / .limit / .offset` invocations and
 *     chains via `this`.
 *   - `whereBuilder.build` returns undefined so the WHERE branch is inert.
 *   - `joinResolver` exposes only the surface the composer touches
 *     (`applyJoins`, `getAllowedColumnsFor`).
 *
 * Note on ESM runner: this spec runs under `yarn test:mikro-orm`
 * (NODE_OPTIONS=--experimental-vm-modules) per CLAUDE.md MikroORM ESM rule.
 * Direct `npx jest` invocation will fail with `import.meta` SyntaxError —
 * always invoke via the package script.
 */
import { jest } from '@jest/globals';
import type { JoinResolver } from '@nestjs-crud/core';
import type { WhereBuilder } from '@nestjs-crud/core/query';
import type { ParsedRequestParams } from '@nestjs-crud/request';
import type { EntityProperty, FilterQuery } from '@mikro-orm/core';
import type { QueryBuilder } from '@mikro-orm/knex';

import { MikroOrmQueryComposer } from '../../src/query/mikro-orm-query-composer';

type MockQuery = {
  select: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  offset: jest.Mock;
};

const buildMockQuery = (): MockQuery => {
  const q: any = {};
  q.select = jest.fn(() => q);
  q.where = jest.fn(() => q);
  q.orderBy = jest.fn(() => q);
  q.limit = jest.fn(() => q);
  q.offset = jest.fn(() => q);
  return q as MockQuery;
};

const buildComposer = (): MikroOrmQueryComposer<{ id: number }> => {
  const noopWhereBuilder: WhereBuilder<QueryBuilder<{ id: number }>, FilterQuery<{ id: number }>> = {
    build: jest.fn(() => undefined),
  } as unknown as WhereBuilder<QueryBuilder<{ id: number }>, FilterQuery<{ id: number }>>;

  const noopJoinResolver: JoinResolver<QueryBuilder<object>> = {
    applyJoins: jest.fn((q: any) => q),
    getAllowedColumnsFor: jest.fn(() => new Set<string>()),
  } as unknown as JoinResolver<QueryBuilder<object>>;

  // propertiesMap with a single 'id' scalar so `getSelect` includes it.
  const propertiesMap: Record<string, EntityProperty> = {
    id: { name: 'id', kind: 'scalar' } as unknown as EntityProperty,
  };

  return new MikroOrmQueryComposer<{ id: number }>({
    entityColumns: ['id'],
    entityPrimaryColumns: ['id'],
    propertiesMap,
    entityHasDeleteColumn: false,
    softDeleteColumn: null,
    onBadRequest: (msg: string) => {
      throw new Error(msg);
    },
    joinResolver: noopJoinResolver,
    whereBuilder: noopWhereBuilder,
  });
};

const baseParsed = (): ParsedRequestParams =>
  ({
    fields: [],
    paramsFilter: [],
    authPersist: undefined,
    classTransformOptions: undefined,
    search: undefined,
    filter: [],
    or: [],
    join: [],
    sort: [],
    limit: undefined,
    offset: undefined,
    page: undefined,
    cache: undefined,
    includeDeleted: 0,
  }) as unknown as ParsedRequestParams;

describe('MikroOrmQueryComposer', () => {
  describe('getTake (opts.limit fallback) — pragma-sweep branch', () => {
    it('uses opts.limit when parsed.limit is undefined', () => {
      const composer = buildComposer();
      const query = buildMockQuery();
      const parsed = baseParsed(); // parsed.limit undefined
      const options = { query: { limit: 25 }, routes: {}, params: {} } as any;

      composer.applyToQuery(query as any, parsed, options);

      expect(query.limit).toHaveBeenCalledTimes(1);
      expect(query.limit).toHaveBeenCalledWith(25);
    });

    it('clamps opts.limit by maxLimit when opts.limit > maxLimit', () => {
      const composer = buildComposer();
      const query = buildMockQuery();
      const parsed = baseParsed();
      const options = { query: { limit: 100, maxLimit: 50 }, routes: {}, params: {} } as any;

      composer.applyToQuery(query as any, parsed, options);

      expect(query.limit).toHaveBeenCalledWith(50);
    });

    it('returns opts.limit unchanged when opts.limit <= maxLimit', () => {
      const composer = buildComposer();
      const query = buildMockQuery();
      const parsed = baseParsed();
      const options = { query: { limit: 30, maxLimit: 50 }, routes: {}, params: {} } as any;

      composer.applyToQuery(query as any, parsed, options);

      expect(query.limit).toHaveBeenCalledWith(30);
    });

    it('parsed.limit takes precedence over opts.limit when both set', () => {
      const composer = buildComposer();
      const query = buildMockQuery();
      const parsed = baseParsed();
      (parsed as any).limit = 7; // parsed wins
      const options = { query: { limit: 99 }, routes: {}, params: {} } as any;

      composer.applyToQuery(query as any, parsed, options);

      expect(query.limit).toHaveBeenCalledWith(7);
    });
  });
});
