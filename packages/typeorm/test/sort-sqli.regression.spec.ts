/**
 * @description D-05b regression: proves dotted-path SQLi vector is REAL on dev
 * HEAD post-commits 7cb3534 (denylist removal) + 31d2edf (mapSort raw-field
 * assert). Expected to FAIL on current HEAD and FLIP GREEN after Wave 1
 * mapSort allowlist tightening lands in TypeOrmQueryTranslator.applyToQuery.
 *
 * Closes v1→v2 regression from denylist removal + mapSort raw-field decision.
 * See: .planning/phases/05-arch-04-slim-typeormcrudservice/05-CONTEXT.md D-05..D-05b
 */
import { BadRequestException } from '@nestjs/common';
import { DataSource, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

import { TypeOrmCrudService } from '../src/typeorm-crud.service';
import { TypeOrmQueryTranslator } from '../src/typeorm-query-translator';
import { TranslatorEntity, TranslatorRelation } from './__fixture__/translator-entity';

// CONTRACT (PATTERNS.md §5 + input-sanitizer.spec.ts:11-22):
// `onBadRequest` MUST throw. A silent no-op stub would let a miss return
// silently — the SQLi bug masked by the test harness. Always a throwing stub.
const makeThrowingServiceStub = (
  entityColumnsHash: ObjectLiteral,
): TypeOrmCrudService<TranslatorEntity> => ({
  entityColumnsHash,
  throwBadRequestException: (msg: string) => {
    throw new BadRequestException(msg);
  },
} as unknown as TypeOrmCrudService<TranslatorEntity>);

describe('mapSort dotted-path SQLi regression (D-05a/D-05b)', () => {
  let dataSource: DataSource;
  let repo: Repository<TranslatorEntity>;
  let translator: TypeOrmQueryTranslator<TranslatorEntity>;

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
    const service = makeThrowingServiceStub({ id: 'id', name: 'name' });
    translator = new TypeOrmQueryTranslator<TranslatorEntity>(repo, service);
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

  const qb = (): SelectQueryBuilder<TranslatorEntity> =>
    repo.createQueryBuilder('TranslatorEntity');

  it.each(injectionVectors)(
    'rejects dotted-path injection vector via BadRequestException: %s',
    (field) => {
      const parsed = {
        ...emptyParsed,
        sort: [{ field, order: 'ASC' as const }],
      };

      // EXPECTED TO FAIL on current dev HEAD: applyToQuery does NOT gate sort
      // today (only WHERE). Wave 1 plan 03 absorbs mapSort with joinResolver
      // allowlist, which flips this spec green. Keep assertion stable across
      // the fix — spec is the contract, not the subject.
      expect(() => translator.applyToQuery(qb(), parsed, emptyOptions)).toThrow(
        BadRequestException,
      );
    },
  );
});
