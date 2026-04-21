import { DataSource, Repository } from 'typeorm';

import { TypeOrmCrudService } from '../src/typeorm-crud.service';
import { TypeOrmQueryTranslator } from '../src/typeorm-query-translator';
import { TranslatorEntity } from './__fixture__/translator-entity';

class TranslatorTestService extends TypeOrmCrudService<TranslatorEntity> {
  constructor(repo: Repository<TranslatorEntity>) {
    super(repo);
  }
}

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

describe('TypeOrmQueryTranslator', () => {
  let dataSource: DataSource;
  let repo: Repository<TranslatorEntity>;
  let service: TranslatorTestService;
  let translator: TypeOrmQueryTranslator<TranslatorEntity>;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [TranslatorEntity],
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
    service = new TranslatorTestService(repo);
    translator = (service as unknown as { translator: TypeOrmQueryTranslator<TranslatorEntity> }).translator;
  });

  // Helper: apply translator output to a fresh qb and return query + params
  const run = (input: any): { sql: string; params: Record<string, any> } => {
    const where = translator.buildWhere(input);
    const qb = repo.createQueryBuilder('TranslatorEntity');
    if (where) qb.andWhere(where);
    return { sql: norm(qb.getQuery()), params: qb.getParameters() };
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
      // nested parens expected
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
});
