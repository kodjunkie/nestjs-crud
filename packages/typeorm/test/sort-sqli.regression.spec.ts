/**
 * @description D-05b regression: proves dotted-path SQLi vector is REAL on dev
 * HEAD post-commits 7cb3534 (denylist removal) + 31d2edf (mapSort raw-field
 * assert). System-Under-Test retargeted in Phase 6.2 Plan 02 onto
 * `TypeOrmQueryComposer` — D-05b SQLi invariant now concentrates there (D-06).
 *
 * Closes v1→v2 regression from denylist removal + mapSort raw-field decision.
 * See: .planning/phases/05-arch-04-slim-typeormcrudservice/05-CONTEXT.md D-05..D-05b
 *      .planning/phases/06.2-... 06.2-CONTEXT.md D-05..D-06
 */
import { BadRequestException } from '@nestjs/common';
import { JoinResolver } from '@nestjs-crud/core';
import { Brackets, DataSource, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

import { TypeOrmQueryComposer } from '../src/query/typeorm-query-composer';
import { TypeOrmWhereBuilder } from '../src/query/typeorm-where-builder';
import { TypeOrmJoinResolver } from '../src/typeorm-join-resolver';
import { TranslatorEntity, TranslatorRelation } from './__fixture__/translator-entity';

// CONTRACT (PATTERNS.md §5 + input-sanitizer.spec.ts:11-22):
// `onBadRequest` MUST throw. A silent no-op stub would let a miss return
// silently — the SQLi bug masked by the test harness. Always a throwing stub.
const throwingOnBadRequest = (msg: string): never => {
  throw new BadRequestException(msg);
};

const makeComposer = (
  repo: Repository<TranslatorEntity>,
  entityColumnsHash: ObjectLiteral,
): TypeOrmQueryComposer<TranslatorEntity> => {
  const joinResolver = new TypeOrmJoinResolver<TranslatorEntity>(repo, { onBadRequest: throwingOnBadRequest });
  const whereBuilder = new TypeOrmWhereBuilder<TranslatorEntity>({
    repo,
    entityColumnsHash,
    onBadRequest: throwingOnBadRequest,
  });
  return new TypeOrmQueryComposer<TranslatorEntity>({
    repo,
    entityColumnsHash,
    entityHasDeleteColumn: true,
    onBadRequest: throwingOnBadRequest,
    joinResolver: joinResolver as JoinResolver<SelectQueryBuilder<TranslatorEntity>>,
    whereBuilder: whereBuilder as unknown as {
      build: (search: any) => Brackets;
    } as any,
  });
};

describe('TypeOrmQueryComposer mapSort dotted-path SQLi regression (D-05a/D-05b)', () => {
  let dataSource: DataSource;
  let repo: Repository<TranslatorEntity>;
  let composer: TypeOrmQueryComposer<TranslatorEntity>;

  // ≥4 injection vectors — representative dotted-path surfaces that today reach
  // the SQL builder unescaped via `addOrderBy(column)` (TypeORM does not
  // parameterize column identifiers).
  const injectionVectors: ReadonlyArray<string> = [
    'a; DROP TABLE users--',
    'profile.name; DELETE FROM x',
    "x.y'; UPDATE users SET",
    'projects.name) UNION SELECT 1--',
    'relation.name; DROP TABLE translator_relation--',
  ];

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
    if (dataSource && dataSource.isInitialized) await dataSource.destroy();
  });

  beforeEach(() => {
    composer = makeComposer(repo, { id: 'id', name: 'name' });
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

  const qb = (): SelectQueryBuilder<TranslatorEntity> => repo.createQueryBuilder('TranslatorEntity');

  it.each(injectionVectors)('rejects dotted-path injection vector via BadRequestException: %s', (field) => {
    const parsed = {
      ...emptyParsed,
      sort: [{ field, order: 'ASC' as const }],
    };

    expect(() => composer.applyToQuery(qb(), parsed, emptyOptions)).toThrow(BadRequestException);
  });
});
