/**
 * Composer-level unit spec for `TypeOrmQueryComposer`.
 *
 * Currently scoped to the **PERF-02 cache fail-fast** branch (Phase 10 Plan 02,
 * D-06..D-09). When other internal branches grow dedicated unit-level tests,
 * extend the mock-repo factory here rather than rolling a parallel one.
 *
 * Mock strategy (no DataSource — pure unit):
 *   - `mockRepo.metadata.columns` → empty array so `getSelect` short-circuits
 *     and the composer never touches column metadata in this suite.
 *   - `mockRepo.manager.connection.queryResultCache` → toggled per test to
 *     drive the new fail-fast guard.
 *   - `mockQuery` is a hand-rolled SelectQueryBuilder stand-in that records
 *     `.cache(...)` invocations.
 */
import type { JoinResolver } from '@nestjs-crud/core';
import type { WhereBuilder } from '@nestjs-crud/core/query';
import { CrudCacheNotConfiguredError } from '@nestjs-crud/core';
import type { ParsedRequestParams } from '@nestjs-crud/request';
import type { Brackets, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

import { TypeOrmQueryComposer } from '../../src/query/typeorm-query-composer';

interface MockUser extends ObjectLiteral {
  id: number;
}

type MockQuery = {
  select: jest.Mock;
  andWhere: jest.Mock;
  withDeleted: jest.Mock;
  orderBy: jest.Mock;
  take: jest.Mock;
  skip: jest.Mock;
  cache: jest.Mock;
};

const buildMockQuery = (): MockQuery => {
  const q: any = {};
  q.select = jest.fn(() => q);
  q.andWhere = jest.fn(() => q);
  q.withDeleted = jest.fn(() => q);
  q.orderBy = jest.fn(() => q);
  q.take = jest.fn(() => q);
  q.skip = jest.fn(() => q);
  q.cache = jest.fn(() => q);
  return q as MockQuery;
};

const buildMockRepo = (queryResultCache: unknown): Repository<MockUser> => {
  return {
    metadata: {
      targetName: 'MockUser',
      columns: [], // empty → composer's getSelect short-circuits, no metadata access
    },
    manager: {
      connection: {
        queryResultCache,
      },
    },
  } as unknown as Repository<MockUser>;
};

const buildComposer = (repo: Repository<MockUser>): TypeOrmQueryComposer<MockUser> => {
  const noopWhereBuilder: WhereBuilder<SelectQueryBuilder<MockUser>, Brackets> = {
    build: jest.fn(() => undefined),
  };
  const noopJoinResolver: JoinResolver<SelectQueryBuilder<MockUser>> = {
    applyJoins: jest.fn((q: any) => q),
    getAllowedColumnsFor: jest.fn(() => new Set<string>()),
  } as unknown as JoinResolver<SelectQueryBuilder<MockUser>>;

  return new TypeOrmQueryComposer<MockUser>({
    repo,
    entityColumnsHash: { id: true },
    entityHasDeleteColumn: false,
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

describe('TypeOrmQueryComposer', () => {
  describe('cache fail-fast (PERF-02 D-06..D-09)', () => {
    it('throws CrudCacheNotConfiguredError when cache option set but DataSource cache provider missing', () => {
      const repo = buildMockRepo(undefined); // queryResultCache undefined
      const composer = buildComposer(repo);
      const query = buildMockQuery();
      const parsed = baseParsed();
      const options = { query: { cache: 5000 } };

      expect(() => composer.applyToQuery(query as unknown as SelectQueryBuilder<MockUser>, parsed, options)).toThrow(
        CrudCacheNotConfiguredError,
      );

      // Sanity: error message names the misconfiguration so consumers see the fix.
      try {
        composer.applyToQuery(query as unknown as SelectQueryBuilder<MockUser>, parsed, options);
      } catch (err: any) {
        expect(err.message).toContain('cache provider');
      }

      // Guard fires BEFORE query.cache is called — no leakage to the underlying QB.
      expect(query.cache).not.toHaveBeenCalled();
    });

    it('green path: passes through to query.cache(ttl) when DataSource cache provider IS configured', () => {
      const repo = buildMockRepo({
        /* truthy mock cache provider */
      });
      const composer = buildComposer(repo);
      const query = buildMockQuery();
      const parsed = baseParsed();
      const options = { query: { cache: 5000 } };

      expect(() =>
        composer.applyToQuery(query as unknown as SelectQueryBuilder<MockUser>, parsed, options),
      ).not.toThrow();
      expect(query.cache).toHaveBeenCalledTimes(1);
      expect(query.cache).toHaveBeenCalledWith(5000);
    });

    it('regression: no-cache option → no throw and query.cache NOT called (guard is gated on queryOptions.cache)', () => {
      const repo = buildMockRepo(undefined); // missing cache provider but option also absent
      const composer = buildComposer(repo);
      const query = buildMockQuery();
      const parsed = baseParsed();
      const options = { query: {} }; // no cache option

      expect(() =>
        composer.applyToQuery(query as unknown as SelectQueryBuilder<MockUser>, parsed, options),
      ).not.toThrow();
      expect(query.cache).not.toHaveBeenCalled();
    });

    it('explicit opt-out (parsed.cache === 0) bypasses the guard even when cache option is set', () => {
      const repo = buildMockRepo(undefined); // missing provider, but request opts out
      const composer = buildComposer(repo);
      const query = buildMockQuery();
      const parsed = baseParsed();
      (parsed as any).cache = 0; // request explicitly disables cache
      const options = { query: { cache: 5000 } };

      expect(() =>
        composer.applyToQuery(query as unknown as SelectQueryBuilder<MockUser>, parsed, options),
      ).not.toThrow();
      expect(query.cache).not.toHaveBeenCalled();
    });
  });
});
