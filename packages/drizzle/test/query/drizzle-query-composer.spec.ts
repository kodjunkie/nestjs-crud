/**
 * Composer-level unit spec for `DrizzleQueryComposer`.
 *
 * Currently scoped to the COVERAGE-01 D-17 sweep (Phase 10 Plan 06):
 * exercises the `getTake` opts.limit fallback branch that previously
 * carried `/* istanbul ignore if * /`. Mirrors Plan 05 Task 1's
 * `typeorm-query-composer.spec.ts › getTake (opts.limit fallback)`
 * structure, adapted to Drizzle's mock surface.
 *
 * Mock strategy (no DB — pure unit):
 *   - `mockQuery` is a hand-rolled `$dynamic()` select-builder stand-in
 *     that records `.where(...) / .orderBy(...) / .limit(...) / .offset(...)`
 *     invocations and chains via `this`.
 *   - `db` is unused for getTake — passed as `{}`.
 *   - `whereBuilder.build` returns undefined so the WHERE branch is inert.
 *   - `joinResolver` exposes only the surface the composer touches.
 */
import type { JoinResolver } from '@nestjs-crud/core';
import type { WhereBuilder } from '@nestjs-crud/core/query';
import type { ParsedRequestParams } from '@nestjs-crud/request';
import type { Column, SQL, Table } from 'drizzle-orm';

import { DrizzleQueryComposer } from '../../src/query/drizzle-query-composer';

type MockQuery = {
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
  offset: jest.Mock;
};

const buildMockQuery = (): MockQuery => {
  const q: any = {};
  q.where = jest.fn(() => q);
  q.orderBy = jest.fn(() => q);
  q.limit = jest.fn(() => q);
  q.offset = jest.fn(() => q);
  return q as MockQuery;
};

const buildComposer = (): DrizzleQueryComposer => {
  const noopWhereBuilder: WhereBuilder<any, SQL | undefined> = {
    build: jest.fn(() => undefined),
  };
  const noopJoinResolver: JoinResolver<any> = {
    applyJoins: jest.fn((q: any) => q),
    getAllowedColumnsFor: jest.fn(() => new Set<string>()),
  } as unknown as JoinResolver<any>;

  return new DrizzleQueryComposer({
    db: {} as any,
    table: {} as Table,
    entityColumns: ['id'],
    entityPrimaryColumns: ['id'],
    columnsMap: {} as Record<string, Column>,
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

describe('DrizzleQueryComposer', () => {
  describe('getTake (opts.limit fallback) — COVERAGE-01 D-17 sweep', () => {
    it('uses opts.limit when parsed.limit is undefined', () => {
      const composer = buildComposer();
      const query = buildMockQuery();
      const parsed = baseParsed(); // parsed.limit undefined
      const options = { query: { limit: 25 } };

      composer.applyToQuery(query as any, parsed, options);

      expect(query.limit).toHaveBeenCalledTimes(1);
      expect(query.limit).toHaveBeenCalledWith(25);
    });

    it('clamps opts.limit by maxLimit when opts.limit > maxLimit', () => {
      const composer = buildComposer();
      const query = buildMockQuery();
      const parsed = baseParsed();
      const options = { query: { limit: 100, maxLimit: 50 } };

      composer.applyToQuery(query as any, parsed, options);

      expect(query.limit).toHaveBeenCalledWith(50);
    });

    it('returns opts.limit unchanged when opts.limit <= maxLimit', () => {
      const composer = buildComposer();
      const query = buildMockQuery();
      const parsed = baseParsed();
      const options = { query: { limit: 30, maxLimit: 50 } };

      composer.applyToQuery(query as any, parsed, options);

      expect(query.limit).toHaveBeenCalledWith(30);
    });

    it('parsed.limit takes precedence over opts.limit when both set', () => {
      const composer = buildComposer();
      const query = buildMockQuery();
      const parsed = baseParsed();
      (parsed as any).limit = 7; // parsed wins
      const options = { query: { limit: 99 } };

      composer.applyToQuery(query as any, parsed, options);

      expect(query.limit).toHaveBeenCalledWith(7);
    });
  });
});
