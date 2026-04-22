/**
 * @description Nyquist SQLi regression matrix for `DrizzleQueryComposer`
 * (post-6.2-03 SUT). Ports the TypeORM matrix verbatim — every dotted-path
 * injection vector must be routed through `onBadRequest` (throwing) before
 * any identifier reaches `sql.identifier`. Drizzle's SQL builder does NOT
 * parameterize column identifiers, so the allowlist is the only defense.
 *
 * Harness contract (PATTERNS.md §5): `onBadRequest` MUST throw. A `jest.fn()`
 * stub would let a miss return silently — masking the exact bug this
 * regression gate exists to close.
 *
 * @see packages/typeorm/test/sort-sqli.regression.spec.ts (source matrix)
 * @see .planning/phases/05-arch-04-slim-typeormcrudservice... 05-CONTEXT.md D-05a/D-05b
 */
import { BadRequestException } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require('better-sqlite3');
import { getTableColumns, getTableName } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { DrizzleJoinResolver } from '../src/drizzle-join-resolver';
import { DrizzleQueryComposer } from '../src/query/drizzle-query-composer';
import { DrizzleWhereBuilder } from '../src/query/drizzle-where-builder';

// CONTRACT: throwing stub — never `jest.fn()` on a security path.
const throwingOnBadRequest = (msg: string): never => {
  throw new BadRequestException(msg);
};

const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name'),
  deletedAt: integer('deleted_at'),
});

const relation = sqliteTable('relation', {
  id: integer('id').primaryKey(),
  name: text('name'),
  userId: integer('user_id'),
});

describe('DrizzleQueryComposer mapSort dotted-path SQLi regression (Nyquist matrix)', () => {
  let sqlite: any;
  let db: ReturnType<typeof drizzle>;
  let composer: DrizzleQueryComposer;

  // ≥4 injection vectors — mirrors the TypeORM vector list verbatim.
  const injectionVectors: ReadonlyArray<string> = [
    'a; DROP TABLE users--',
    'profile.name; DELETE FROM x',
    "x.y'; UPDATE users SET",
    'projects.name) UNION SELECT 1--',
    'relation.name; DROP TABLE translator_relation--',
  ];

  beforeAll(() => {
    sqlite = new Database(':memory:');
    db = drizzle(sqlite);
  });

  afterAll(() => {
    sqlite.close();
  });

  beforeEach(() => {
    const joinResolver = new DrizzleJoinResolver({
      relationsConfig: {
        relation: {
          table: relation,
          foreignKey: relation.userId,
          referenceKey: users.id,
        },
      },
      onBadRequest: throwingOnBadRequest,
    });

    const columnsMap = getTableColumns(users) as any;
    const whereBuilder = new DrizzleWhereBuilder({
      columnsMap,
      dbDialect: 'sqlite',
      onBadRequest: throwingOnBadRequest,
    });
    composer = new DrizzleQueryComposer({
      db,
      table: users,
      entityColumns: Object.keys(columnsMap),
      entityPrimaryColumns: ['id'],
      columnsMap,
      entityHasDeleteColumn: true,
      softDeleteColumn: (users as any).deletedAt,
      onBadRequest: throwingOnBadRequest,
      joinResolver,
      whereBuilder,
    });
    // Silence unused-table lint — `getTableName` also asserts schema is wired.
    expect(getTableName(relation)).toBe('relation');
  });

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

  it.each(injectionVectors)('rejects dotted-path injection vector via BadRequestException: %s', (field) => {
    const parsed = {
      ...emptyParsed,
      sort: [{ field, order: 'ASC' as const }],
    };
    const query = composer.newQuery();

    expect(() => composer.applyToQuery(query, parsed, emptyOptions)).toThrow(BadRequestException);
  });

  it('rejects single-segment injection-shaped field (not a dotted path)', () => {
    const parsed = {
      ...emptyParsed,
      sort: [{ field: 'name; DROP TABLE users--', order: 'ASC' as const }],
    };
    const query = composer.newQuery();

    expect(() => composer.applyToQuery(query, parsed, emptyOptions)).toThrow(BadRequestException);
  });
});
