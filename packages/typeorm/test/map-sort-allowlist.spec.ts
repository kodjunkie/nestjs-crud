/**
 * Nyquist-matrix spec for dotted-path sort allowlist.
 * Single-segment fields assert against `entityColumnsHash`; dotted-path fields
 * assert against `joinResolver.getAllowedColumnsFor(relation)`. Unknown relation
 * OR unknown relation-column throws `BadRequestException` BEFORE the identifier
 * reaches `addOrderBy` (TypeORM does not parameterize column identifiers — the
 * allowlist is the only defense).
 *
 * SUT retargeted from `TypeOrmQueryTranslator` to
 * `TypeOrmQueryComposer` (the dotted-path SQLi invariant concentrates in the composer).
 *
 * Harness contract (PATTERNS.md §5): `onBadRequest` MUST throw. A silent
 * no-op stub would let a miss pass through undetected, masking the bug the
 * spec exists to prove closed.
 *
 * @see packages/core/test/input-sanitizer.spec.ts — analogous hit/miss matrix
 */
import { BadRequestException } from '@nestjs/common';
import { JoinResolver } from '@nestjs-crud/core';
import { Brackets, DataSource, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

import { TypeOrmQueryComposer } from '../src/query/typeorm-query-composer';
import { TypeOrmWhereBuilder } from '../src/query/typeorm-where-builder';
import { TypeOrmJoinResolver } from '../src/typeorm-join-resolver';
import { TranslatorEntity, TranslatorRelation } from './__fixture__/translator-entity';

const throwingOnBadRequest = (msg: string): never => {
  throw new BadRequestException(msg);
};

const emptyOptions = { query: {}, routes: {}, params: {} } as any;

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

describe('TypeOrmQueryComposer mapSort allowlist (D-05b)', () => {
  let dataSource: DataSource;
  let repo: Repository<TranslatorEntity>;
  let composer: TypeOrmQueryComposer<TranslatorEntity>;
  let joinResolver: TypeOrmJoinResolver<TranslatorEntity>;

  const entityColumnsHash: ObjectLiteral = { id: 'id', name: 'name', age: 'age', relationId: 'relationId' };

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
    joinResolver = new TypeOrmJoinResolver<TranslatorEntity>(repo, { onBadRequest: throwingOnBadRequest });
    // Prime the join resolver's allowlist for `relation` by applying eager joins.
    const primeQb = repo.createQueryBuilder('TranslatorEntity');
    joinResolver.applyJoins(primeQb, [], { relation: { eager: true } });

    const whereBuilder = new TypeOrmWhereBuilder<TranslatorEntity>({
      repo,
      entityColumnsHash,
      onBadRequest: throwingOnBadRequest,
    });

    composer = new TypeOrmQueryComposer<TranslatorEntity>({
      repo,
      entityColumnsHash,
      entityHasDeleteColumn: true,
      onBadRequest: throwingOnBadRequest,
      joinResolver: joinResolver as JoinResolver<SelectQueryBuilder<TranslatorEntity>>,
      whereBuilder: whereBuilder as unknown as {
        build: (search: any) => Brackets;
      } as any,
    });
  });

  const qb = (): SelectQueryBuilder<TranslatorEntity> => repo.createQueryBuilder('TranslatorEntity');

  const applyWithSort = (field: string): void => {
    composer.applyToQuery(qb(), { ...emptyParsed, sort: [{ field, order: 'ASC' as const }] }, emptyOptions);
  };

  describe('single-segment field', () => {
    it('allows whitelisted column', () => {
      expect(() => applyWithSort('name')).not.toThrow();
    });

    it('allows another whitelisted column', () => {
      expect(() => applyWithSort('age')).not.toThrow();
    });

    it('throws BadRequestException on unknown column', () => {
      expect(() => applyWithSort('ssn')).toThrow(BadRequestException);
    });

    it('throws BadRequestException on injection-shaped single-segment', () => {
      expect(() => applyWithSort('name; DROP TABLE users--')).toThrow(BadRequestException);
    });
  });

  describe('dotted-path field', () => {
    it('allows known relation + known column', () => {
      expect(() => applyWithSort('relation.name')).not.toThrow();
    });

    it('throws BadRequestException on unknown relation', () => {
      expect(() => applyWithSort('ghost.name')).toThrow(BadRequestException);
    });

    it('throws BadRequestException on known relation + unknown column', () => {
      expect(() => applyWithSort('relation.ssn')).toThrow(BadRequestException);
    });

    it('throws BadRequestException on injection vector under unknown relation', () => {
      expect(() => applyWithSort('profile.name; DELETE FROM x')).toThrow(BadRequestException);
    });

    it('throws BadRequestException on injection vector with UNION payload', () => {
      expect(() => applyWithSort('projects.name) UNION SELECT 1--')).toThrow(BadRequestException);
    });
  });
});
