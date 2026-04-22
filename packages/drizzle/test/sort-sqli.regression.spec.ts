/**
 * @description Nyquist SQLi regression matrix for `DrizzleQueryTranslator.mapSort`.
 * Ports the TypeORM matrix (`packages/typeorm/test/sort-sqli.regression.spec.ts`)
 * verbatim to the Drizzle adapter. Every dotted-path injection vector is
 * routed through the translator's `onBadRequest` throwing sink — a silent
 * pass-through would let an attacker-controlled identifier reach
 * `sql.identifier` / raw `addOrderBy`. Drizzle's SQL builder does NOT
 * parameterize column identifiers, so the allowlist is the only defense.
 *
 * Harness contract (PATTERNS.md §5 + input-sanitizer.spec.ts:11-22):
 * `onBadRequest` MUST throw. A `jest.fn()` stub would let a miss return
 * silently — masking the exact bug this regression gate exists to close.
 *
 * @see packages/typeorm/test/sort-sqli.regression.spec.ts (source matrix)
 * @see .planning/phases/05-arch-04-slim-typeormcrudservice/05-CONTEXT.md D-05a/D-05b
 */
import { BadRequestException } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Database = require('better-sqlite3');
import { getTableColumns, getTableName } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { DrizzleJoinResolver } from '../src/drizzle-join-resolver';
import { DrizzleQueryTranslator } from '../src/drizzle-query-translator';

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

type UserRow = { id: number; name: string | null; deletedAt: number | null };

describe('DrizzleQueryTranslator mapSort dotted-path SQLi regression (Nyquist matrix)', () => {
  let sqlite: any;
  let db: ReturnType<typeof drizzle>;
  let translator: DrizzleQueryTranslator<UserRow>;

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
    translator = new DrizzleQueryTranslator<UserRow>(db, users, {
      entityColumns: Object.keys(columnsMap),
      entityPrimaryColumns: ['id'],
      columnsMap,
      entityHasDeleteColumn: true,
      softDeleteColumn: (users as any).deletedAt,
      dbDialect: 'sqlite',
      onBadRequest: throwingOnBadRequest,
      joinResolver,
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
    const query = translator.newQuery();

    expect(() => translator.applyToQuery(query, parsed, emptyOptions)).toThrow(BadRequestException);
  });

  it('rejects single-segment injection-shaped field (not a dotted path)', () => {
    const parsed = {
      ...emptyParsed,
      sort: [{ field: 'name; DROP TABLE users--', order: 'ASC' as const }],
    };
    const query = translator.newQuery();

    expect(() => translator.applyToQuery(query, parsed, emptyOptions)).toThrow(BadRequestException);
  });
});
