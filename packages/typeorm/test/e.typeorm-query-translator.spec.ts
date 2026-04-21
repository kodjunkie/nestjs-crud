import { BadRequestException } from '@nestjs/common';
import { JoinResolver } from '@nestjs-crud/core';
import { DataSource, ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

import { TypeOrmJoinResolver } from '../src/typeorm-join-resolver';
import { TypeOrmQueryTranslator } from '../src/typeorm-query-translator';
import { TranslatorEntity, TranslatorRelation } from './__fixture__/translator-entity';

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

const throwingOnBadRequest = (msg: string): never => {
  throw new BadRequestException(msg);
};

const entityColumnsHash: ObjectLiteral = {
  id: 'id',
  name: 'name',
  age: 'age',
  status: 'status',
  email: 'email',
  relationId: 'relationId',
  deletedAt: 'deleted_at',
};

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

describe('TypeOrmQueryTranslator', () => {
  let dataSource: DataSource;
  let repo: Repository<TranslatorEntity>;
  let translator: TypeOrmQueryTranslator<TranslatorEntity>;
  let joinResolver: TypeOrmJoinResolver<TranslatorEntity>;

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
    translator = new TypeOrmQueryTranslator<TranslatorEntity>(repo, {
      entityColumnsHash,
      entityHasDeleteColumn: true,
      onBadRequest: throwingOnBadRequest,
      joinResolver: joinResolver as JoinResolver<SelectQueryBuilder<TranslatorEntity>>,
    });
  });

  const run = (input: any): { sql: string; params: Record<string, any> } => {
    const where = translator.buildWhere(input);
    const qb = repo.createQueryBuilder('TranslatorEntity');
    if (where) qb.andWhere(where);
    return { sql: norm(qb.getQuery()), params: qb.getParameters() };
  };

  const applyAll = (
    parsed: Partial<typeof emptyParsed>,
    options: any = emptyOptions,
  ): SelectQueryBuilder<TranslatorEntity> => {
    const qb = repo.createQueryBuilder('TranslatorEntity');
    return translator.applyToQuery(qb, { ...emptyParsed, ...parsed }, options);
  };

  describe('edge cases', () => {
    it('returns undefined for empty object', () => {
      expect(translator.buildWhere({} as any)).toBeUndefined();
    });

    it('returns undefined for null input', () => {
      expect(translator.buildWhere(null as any)).toBeUndefined();
    });

    it('returns undefined for undefined input', () => {
      expect(translator.buildWhere(undefined as any)).toBeUndefined();
    });

    it('rewrites `{ field: null }` to IS NULL', () => {
      const { sql } = run({ name: null });
      expect(sql).toMatch(/IS NULL/);
    });
  });

  describe('comparison operators', () => {
    it('$eq emits `=`', () => {
      const { sql, params } = run({ name: { $eq: 'foo' } });
      expect(sql).toMatch(/"TranslatorEntity"\."name" = :name\d+/);
      expect(Object.values(params)).toContain('foo');
    });

    it('$ne emits `!=`', () => {
      const { sql, params } = run({ name: { $ne: 'foo' } });
      expect(sql).toMatch(/!= :name\d+/);
      expect(Object.values(params)).toContain('foo');
    });

    it('$gt emits `>`', () => {
      const { sql, params } = run({ age: { $gt: 5 } });
      expect(sql).toMatch(/> :age\d+/);
      expect(Object.values(params)).toContain(5);
    });

    it('$lt emits `<`', () => {
      const { sql, params } = run({ age: { $lt: 5 } });
      expect(sql).toMatch(/< :age\d+/);
      expect(Object.values(params)).toContain(5);
    });

    it('$gte emits `>=`', () => {
      const { sql, params } = run({ age: { $gte: 5 } });
      expect(sql).toMatch(/>= :age\d+/);
      expect(Object.values(params)).toContain(5);
    });

    it('$lte emits `<=`', () => {
      const { sql, params } = run({ age: { $lte: 5 } });
      expect(sql).toMatch(/<= :age\d+/);
      expect(Object.values(params)).toContain(5);
    });
  });

  describe('string operators', () => {
    it('$starts emits LIKE with trailing %', () => {
      const { sql, params } = run({ name: { $starts: 'foo' } });
      expect(sql).toMatch(/LIKE :name\d+/);
      expect(Object.values(params)).toContain('foo%');
    });

    it('$ends emits LIKE with leading %', () => {
      const { sql, params } = run({ name: { $ends: 'foo' } });
      expect(sql).toMatch(/LIKE :name\d+/);
      expect(Object.values(params)).toContain('%foo');
    });

    it('$cont emits LIKE with wrapping %', () => {
      const { sql, params } = run({ name: { $cont: 'foo' } });
      expect(sql).toMatch(/LIKE :name\d+/);
      expect(Object.values(params)).toContain('%foo%');
    });

    it('$excl emits NOT LIKE with wrapping %', () => {
      const { sql, params } = run({ name: { $excl: 'foo' } });
      expect(sql).toMatch(/NOT LIKE :name\d+/);
      expect(Object.values(params)).toContain('%foo%');
    });
  });

  describe('list operators', () => {
    it('$in emits IN (...)', () => {
      const { sql, params } = run({ status: { $in: ['a', 'b'] } });
      expect(sql).toMatch(/IN \(/);
      expect(Object.values(params).flat()).toEqual(expect.arrayContaining(['a', 'b']));
    });

    it('$notin emits NOT IN (...)', () => {
      const { sql, params } = run({ status: { $notin: ['a', 'b'] } });
      expect(sql).toMatch(/NOT IN \(/);
      expect(Object.values(params).flat()).toEqual(expect.arrayContaining(['a', 'b']));
    });

    it('$in throws when value is not an array', () => {
      expect(() => run({ status: { $in: 'nope' as any } })).toThrow();
    });

    it('$notin throws when value is not an array', () => {
      expect(() => run({ status: { $notin: 'nope' as any } })).toThrow();
    });
  });

  describe('null operators', () => {
    it('$isnull emits IS NULL with no param', () => {
      const { sql } = run({ age: { $isnull: true } });
      expect(sql).toMatch(/"age" IS NULL/);
    });

    it('$notnull emits IS NOT NULL with no param', () => {
      const { sql } = run({ age: { $notnull: true } });
      expect(sql).toMatch(/"age" IS NOT NULL/);
    });
  });

  describe('range operators', () => {
    it('$between emits BETWEEN :p0 AND :p1 with dual params', () => {
      const { sql, params } = run({ age: { $between: [1, 10] } });
      expect(sql).toMatch(/BETWEEN :age\d+0 AND :age\d+1/);
      expect(Object.values(params)).toEqual(expect.arrayContaining([1, 10]));
    });

    it('$between throws when array length !== 2', () => {
      expect(() => run({ age: { $between: [1] as any } })).toThrow();
    });
  });

  describe('case-insensitive L variants', () => {
    it('$eqL emits LOWER(field) =', () => {
      const { sql, params } = run({ name: { $eqL: 'foo' } });
      expect(sql).toMatch(/LOWER\("TranslatorEntity"\."name"\) = :name\d+/);
      expect(Object.values(params)).toContain('foo');
    });

    it('$neL emits LOWER(field) !=', () => {
      const { sql, params } = run({ name: { $neL: 'foo' } });
      expect(sql).toMatch(/LOWER\(.*\) != :name\d+/);
      expect(Object.values(params)).toContain('foo');
    });

    it('$startsL emits LOWER(field) LIKE with trailing %', () => {
      const { sql, params } = run({ name: { $startsL: 'foo' } });
      expect(sql).toMatch(/LOWER\(.*\) LIKE :name\d+/);
      expect(Object.values(params)).toContain('foo%');
    });

    it('$endsL emits LOWER(field) LIKE with leading %', () => {
      const { sql, params } = run({ name: { $endsL: 'foo' } });
      expect(sql).toMatch(/LOWER\(.*\) LIKE :name\d+/);
      expect(Object.values(params)).toContain('%foo');
    });

    it('$contL emits LOWER(field) LIKE with wrapping %', () => {
      const { sql, params } = run({ name: { $contL: 'foo' } });
      expect(sql).toMatch(/LOWER\(.*\) LIKE :name\d+/);
      expect(Object.values(params)).toContain('%foo%');
    });

    it('$exclL emits LOWER(field) NOT LIKE with wrapping %', () => {
      const { sql, params } = run({ name: { $exclL: 'foo' } });
      expect(sql).toMatch(/LOWER\(.*\) NOT LIKE :name\d+/);
      expect(Object.values(params)).toContain('%foo%');
    });

    it('$inL emits LOWER(field) IN (...)', () => {
      const { sql, params } = run({ status: { $inL: ['a', 'b'] } });
      expect(sql).toMatch(/LOWER\(.*\) IN \(/);
      expect(Object.values(params).flat()).toEqual(expect.arrayContaining(['a', 'b']));
    });

    it('$notinL emits LOWER(field) NOT IN (...)', () => {
      const { sql, params } = run({ status: { $notinL: ['a', 'b'] } });
      expect(sql).toMatch(/LOWER\(.*\) NOT IN \(/);
      expect(Object.values(params).flat()).toEqual(expect.arrayContaining(['a', 'b']));
    });

    it('$inL throws when value is not an array', () => {
      expect(() => run({ status: { $inL: 'nope' as any } })).toThrow();
    });

    it('$notinL throws when value is not an array', () => {
      expect(() => run({ status: { $notinL: 'nope' as any } })).toThrow();
    });
  });

  describe('connective / nesting', () => {
    it('flat single key yields a `=` predicate', () => {
      const { sql } = run({ name: 'foo' });
      expect(sql).toMatch(/"name" = :name\d+/);
    });

    it('flat multiple keys yield AND of all predicates', () => {
      const { sql, params } = run({ name: 'foo', age: 10 });
      expect(sql).toMatch(/"name" = :name\d+/);
      expect(sql).toMatch(/"age" = :age\d+/);
      expect(Object.values(params)).toEqual(expect.arrayContaining(['foo', 10]));
    });

    it('one-level $and composes ANDed predicates', () => {
      const { sql } = run({ $and: [{ name: 'foo' }, { age: 10 }] });
      expect(sql).toMatch(/"name" = :name\d+/);
      expect(sql).toMatch(/"age" = :age\d+/);
      expect(sql).toMatch(/AND/);
    });

    it('one-level $or composes ORed predicates', () => {
      const { sql } = run({ $or: [{ name: 'foo' }, { age: 10 }] });
      expect(sql).toMatch(/"name" = :name\d+/);
      expect(sql).toMatch(/"age" = :age\d+/);
      expect(sql).toMatch(/OR/);
    });

    it('two-level mixed $and-of-$or composes nested brackets', () => {
      const { sql } = run({
        $and: [{ $or: [{ name: 'x' }, { age: 10 }] }, { status: 'z' }],
      });
      expect(sql).toMatch(/OR/);
      expect(sql).toMatch(/"status" = :status\d+/);
      expect((sql.match(/\(/g) || []).length).toBeGreaterThanOrEqual(2);
    });

    it('operator-object with embedded $or on one field', () => {
      const { sql } = run({ name: { $or: { $eq: 'foo', $ne: 'bar' } } });
      expect(sql).toMatch(/"name" = :name\d+/);
      expect(sql).toMatch(/"name" != :name\d+/);
    });
  });

  describe('parameter-binding collision', () => {
    it('same field twice in $and uses distinct param keys', () => {
      const { sql, params } = run({ $and: [{ name: 'a' }, { name: 'b' }] });
      const keys = Object.keys(params).filter((k) => k.startsWith('name'));
      expect(keys.length).toBeGreaterThanOrEqual(2);
      expect(new Set(keys).size).toBe(keys.length);
      expect(sql).toMatch(/"name" = :name\d+/);
    });

    it('$between uses distinct `0` / `1` suffixed param keys', () => {
      const { params } = run({ age: { $between: [1, 10] } });
      const keys = Object.keys(params).filter((k) => k.startsWith('age'));
      expect(keys.some((k) => /0$/.test(k))).toBe(true);
      expect(keys.some((k) => /1$/.test(k))).toBe(true);
    });

    it('operator-object with multiple ops on one field yields distinct param keys', () => {
      const { sql, params } = run({ age: { $gte: 1, $lte: 10 } });
      const keys = Object.keys(params).filter((k) => k.startsWith('age'));
      expect(new Set(keys).size).toBe(keys.length);
      expect(sql).toMatch(/>= :age\d+/);
      expect(sql).toMatch(/<= :age\d+/);
    });
  });

  describe('soft-delete user-supplied condition', () => {
    it('{ deletedAt: { $isnull: true } } emits IS NULL', () => {
      const { sql } = run({ deletedAt: { $isnull: true } });
      expect(sql).toMatch(/"deleted_at" IS NULL/);
    });
  });

  describe('legacy operator form', () => {
    it('operator without `$` prefix gets normalized', () => {
      const { sql, params } = run({ name: { eq: 'foo' } as any });
      expect(sql).toMatch(/"name" = :name\d+/);
      expect(Object.values(params)).toContain('foo');
    });
  });

  describe('applyToQuery — sort', () => {
    it('single sort field emits ORDER BY with ASC', () => {
      const qb = applyAll({ sort: [{ field: 'name', order: 'ASC' }] });
      expect(norm(qb.getQuery())).toMatch(/ORDER BY "TranslatorEntity_name" ASC/);
    });

    it('multiple sort fields emits both in order', () => {
      const qb = applyAll({
        sort: [
          { field: 'name', order: 'ASC' },
          { field: 'age', order: 'DESC' },
        ],
      });
      const sql = norm(qb.getQuery());
      expect(sql).toMatch(/ORDER BY/);
      expect(sql).toMatch(/"TranslatorEntity_name" ASC/);
      expect(sql).toMatch(/"TranslatorEntity_age" DESC/);
    });

    it('empty sort array emits no ORDER BY clause', () => {
      const qb = applyAll({ sort: [] });
      expect(norm(qb.getQuery())).not.toMatch(/ORDER BY/);
    });

    it('falls back to options.query.sort when parsed.sort is empty', () => {
      const qb = applyAll(
        { sort: [] },
        { query: { sort: [{ field: 'name', order: 'DESC' }] }, routes: {}, params: {} },
      );
      expect(norm(qb.getQuery())).toMatch(/"TranslatorEntity_name" DESC/);
    });
  });

  describe('applyToQuery — pagination', () => {
    it('page + limit computes take=limit, skip=(page-1)*limit', () => {
      const qb = applyAll({ page: 2, limit: 10 });
      expect(qb.expressionMap.take).toBe(10);
      expect(qb.expressionMap.skip).toBe(10);
    });

    it('offset + limit uses offset directly as skip', () => {
      const qb = applyAll({ offset: 20, limit: 5 });
      expect(qb.expressionMap.take).toBe(5);
      expect(qb.expressionMap.skip).toBe(20);
    });

    it('no pagination hints and no maxLimit → neither take nor skip', () => {
      const qb = applyAll({});
      expect(qb.expressionMap.take).toBeFalsy();
      expect(qb.expressionMap.skip).toBeFalsy();
    });

    it('options.maxLimit caps user-supplied limit', () => {
      const qb = applyAll({ limit: 9999 }, { query: { maxLimit: 50 }, routes: {}, params: {} });
      expect(qb.expressionMap.take).toBe(50);
    });
  });

  describe('applyToQuery — field selection', () => {
    it('parsed.fields filters SELECT to requested + primary columns', () => {
      const qb = applyAll({ fields: ['name'] });
      const sql = norm(qb.getQuery());
      expect(sql).toMatch(/"TranslatorEntity"\.\"name\"/);
      expect(sql).toMatch(/"TranslatorEntity"\.\"id\"/);
    });

    it('no parsed.fields → SELECT includes entity columns', () => {
      const qb = applyAll({});
      const sql = norm(qb.getQuery());
      expect(sql).toMatch(/"TranslatorEntity"\.\"name\"/);
      expect(sql).toMatch(/"TranslatorEntity"\.\"age\"/);
    });

    it('options.query.persist forces columns even when not in parsed.fields', () => {
      const qb = applyAll({ fields: ['name'] }, { query: { persist: ['email'] }, routes: {}, params: {} });
      const sql = norm(qb.getQuery());
      expect(sql).toMatch(/"TranslatorEntity"\.\"email\"/);
    });
  });

  describe('applyToQuery — soft-delete', () => {
    it('includeDeleted=1 + softDelete=true + entity has delete column → calls withDeleted()', () => {
      const qb = applyAll({ includeDeleted: 1 }, { query: { softDelete: true }, routes: {}, params: {} });
      expect(qb.expressionMap.withDeleted).toBe(true);
    });

    it('includeDeleted=0 → does NOT call withDeleted()', () => {
      const qb = applyAll({ includeDeleted: 0 }, { query: { softDelete: true }, routes: {}, params: {} });
      expect(qb.expressionMap.withDeleted).toBe(false);
    });
  });

  describe('applyToQuery — eager joins', () => {
    it('options.query.join with eager=true produces LEFT JOIN on relation', () => {
      const qb = applyAll({}, { query: { join: { relation: { eager: true } } }, routes: {}, params: {} });
      const sql = norm(qb.getQuery());
      expect(sql).toMatch(/LEFT JOIN "translator_relation" "relation"/);
    });

    it('no join options → no JOIN in generated SQL', () => {
      const qb = applyAll({});
      expect(norm(qb.getQuery())).not.toMatch(/JOIN/);
    });
  });

  describe('applyToQuery — mapSort D-05b allowlist integration', () => {
    it('throws BadRequestException on unknown single-segment sort field', () => {
      expect(() => applyAll({ sort: [{ field: 'ssn', order: 'ASC' }] })).toThrow(BadRequestException);
    });

    it('throws BadRequestException on dotted-path with unknown relation', () => {
      expect(() => applyAll({ sort: [{ field: 'ghost.name', order: 'ASC' }] })).toThrow(BadRequestException);
    });
  });
});
