/**
 * @description Nyquist SQLi regression matrix for `MikroOrmQueryComposer.applyToQuery`
 * (sort branch). Ports the TypeORM matrix (`packages/typeorm/test/sort-sqli.regression.spec.ts`)
 * + Drizzle precedent (`packages/drizzle/test/sort-sqli.regression.spec.ts`) verbatim
 * to the MikroORM adapter. Every dotted-path injection vector is routed through the
 * composer's `onBadRequest` throwing sink — a silent pass-through would let an
 * attacker-controlled identifier reach the underlying SQL builder.
 *
 * System-Under-Test: `MikroOrmQueryComposer` — the dotted-path SQLi invariant concentrates there post-decomposition.
 *
 * Harness contract (PATTERNS.md §5 + input-sanitizer.spec.ts:11-22):
 * `onBadRequest` MUST throw. A `jest.fn()` stub would let a miss return
 * silently — masking the exact bug this regression gate exists to close.
 *
 * Entities are defined via `EntitySchema` (@mikro-orm/core v7 dropped the
 * `@Entity` decorator in favour of schema / defineEntity).
 *
 * @see packages/typeorm/test/sort-sqli.regression.spec.ts (source matrix)
 * @see packages/drizzle/test/sort-sqli.regression.spec.ts (Drizzle analog)
 */
import { BadRequestException } from '@nestjs/common';
import { EntitySchema } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/sqlite';

import { MikroOrmJoinResolver } from '../src/mikro-orm-join-resolver';
import { MikroOrmQueryComposer } from '../src/query/mikro-orm-query-composer';
import { MikroOrmWhereBuilder } from '../src/query/mikro-orm-where-builder';

// CONTRACT: throwing stub — never `jest.fn()` on a security path.
const throwingOnBadRequest = (msg: string): never => {
  throw new BadRequestException(msg);
};

class SqliUser {
  id!: number;

  name?: string;

  deletedAt?: Date;
}

const SqliUserSchema = new EntitySchema<SqliUser>({
  class: SqliUser,
  tableName: 'sqli_users',
  properties: {
    id: { primary: true, type: 'number' },
    name: { type: 'string', nullable: true },
    deletedAt: { type: 'Date', nullable: true },
  },
});

describe('MikroOrmQueryComposer mapSort dotted-path SQLi regression (Nyquist matrix)', () => {
  let orm: MikroORM;
  let composer: MikroOrmQueryComposer<SqliUser>;

  // ≥4 injection vectors — mirrors TypeORM + Drizzle vector list verbatim.
  const injectionVectors: ReadonlyArray<string> = [
    'a; DROP TABLE users--',
    'profile.name; DELETE FROM x',
    "x.y'; UPDATE users SET",
    'projects.name) UNION SELECT 1--',
    'relation.name; DROP TABLE translator_relation--',
  ];

  beforeAll(async () => {
    orm = await MikroORM.init({
      entities: [SqliUserSchema],
      dbName: ':memory:',
      allowGlobalContext: true,
    });
    await orm.schema.create();
  });

  afterAll(async () => {
    if (orm) await orm.close(true);
  });

  beforeEach(() => {
    const metadata = orm.em.getMetadata().get(SqliUser);
    const joinResolver = new MikroOrmJoinResolver({
      metadata,
      onBadRequest: throwingOnBadRequest,
    });
    const propertiesMap = (metadata as any).properties as Record<string, any>;
    const whereBuilder = new MikroOrmWhereBuilder<SqliUser>({
      propertiesMap,
      dbDialect: 'sqlite',
      onBadRequest: throwingOnBadRequest,
    });

    composer = new MikroOrmQueryComposer<SqliUser>({
      entityColumns: ['id', 'name', 'deletedAt'],
      entityPrimaryColumns: ['id'],
      propertiesMap,
      entityHasDeleteColumn: true,
      softDeleteColumn: 'deletedAt',
      onBadRequest: throwingOnBadRequest,
      joinResolver,
      whereBuilder,
    });
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

  const qb = (): any => orm.em.fork().createQueryBuilder(SqliUser);

  it.each(injectionVectors)('rejects dotted-path injection vector via BadRequestException: %s', (field) => {
    const parsed = {
      ...emptyParsed,
      sort: [{ field, order: 'ASC' as const }],
    };

    expect(() => composer.applyToQuery(qb(), parsed, emptyOptions)).toThrow(BadRequestException);
  });

  it('rejects single-segment injection-shaped field (not a dotted path)', () => {
    const parsed = {
      ...emptyParsed,
      sort: [{ field: 'name; DROP TABLE users--', order: 'ASC' as const }],
    };

    expect(() => composer.applyToQuery(qb(), parsed, emptyOptions)).toThrow(BadRequestException);
  });

  it('allows a known own-field as a sort target (allowlist HIT)', () => {
    const parsed = {
      ...emptyParsed,
      sort: [{ field: 'name', order: 'ASC' as const }],
    };

    expect(() => composer.applyToQuery(qb(), parsed, emptyOptions)).not.toThrow();
  });
});
