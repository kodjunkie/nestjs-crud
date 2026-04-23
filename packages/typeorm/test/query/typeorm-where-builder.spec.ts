/**
 * Unit spec for `TypeOrmWhereBuilder` covering pragma-sweep targets the
 * higher-level translator integration spec (`e.typeorm-query-translator.spec.ts`)
 * cannot hit because it is bound to the `better-sqlite3` dialect at construction
 * time:
 *
 *   - mysql/mariadb identifier-quoting branch in `getFieldWithAlias` (L398
 *     in the pre-sweep file).
 *   - mysql/mariadb LIKE-vs-ILIKE branch in `mapOperatorsToQuery` (L263
 *     in the pre-sweep file).
 *
 * Mock strategy (no DataSource): a hand-rolled `Repository` stand-in whose
 * `metadata.connection.options.type` is set per-test, plus a `Brackets`
 * collector that captures the `(qb) => ...` callback so we can serialize
 * what the builder pushed into the SQL fragment.
 *
 * @see the istanbul-ignore pragma sweep for dialect-branch coverage rationale.
 */
import type { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';

import { TypeOrmWhereBuilder } from '../../src/query/typeorm-where-builder';

interface MockEntity extends ObjectLiteral {
  id: number;
  name: string;
}

type Captured = {
  conditions: Array<{ kind: 'and' | 'or'; field: string; str: string; params: ObjectLiteral }>;
};

const buildMockRepo = (dbType: string): Repository<MockEntity> => {
  return {
    metadata: {
      targetName: 'MockEntity',
      connection: {
        options: { type: dbType },
      },
    },
  } as unknown as Repository<MockEntity>;
};

const buildMockQb = (captured: Captured): SelectQueryBuilder<MockEntity> => {
  const qb: any = {
    andWhere: jest.fn((arg1: any, arg2?: ObjectLiteral) => {
      // arg1 is either a Brackets (when nested) or a SQL string fragment.
      if (typeof arg1 === 'string') {
        captured.conditions.push({ kind: 'and', field: arg1, str: arg1, params: arg2 ?? {} });
      } else if (arg1 && typeof arg1.whereFactory === 'function') {
        // Re-enter the Brackets factory with this same qb so nested predicates
        // funnel into the same collector.
        arg1.whereFactory(qb);
      }
      return qb;
    }),
    orWhere: jest.fn((arg1: any, arg2?: ObjectLiteral) => {
      if (typeof arg1 === 'string') {
        captured.conditions.push({ kind: 'or', field: arg1, str: arg1, params: arg2 ?? {} });
      } else if (arg1 && typeof arg1.whereFactory === 'function') {
        arg1.whereFactory(qb);
      }
      return qb;
    }),
  };
  return qb as SelectQueryBuilder<MockEntity>;
};

const runBuild = (
  dbType: string,
  search: any,
  entityColumnsHash: ObjectLiteral = { id: 'id', name: 'name' },
): Captured => {
  const repo = buildMockRepo(dbType);
  const builder = new TypeOrmWhereBuilder<MockEntity>({
    repo,
    entityColumnsHash,
    onBadRequest: (msg: string) => {
      throw new Error(msg);
    },
  });
  const brackets = builder.build(search);
  const captured: Captured = { conditions: [] };
  if (brackets) {
    const qb = buildMockQb(captured);
    // Brackets exposes its factory as `.whereFactory` on the built object.
    (brackets as any).whereFactory(qb);
  }
  return captured;
};

describe('TypeOrmWhereBuilder — dialect branches', () => {
  describe('LIKE operator dialect detection (L263 pragma sweep)', () => {
    it('emits ILIKE on postgres for $contL', () => {
      const captured = runBuild('postgres', { name: { $contL: 'foo' } });
      const sql = captured.conditions.map((c) => c.str).join(' ');
      expect(sql).toMatch(/ILIKE/);
      expect(sql).not.toMatch(/[^I]LIKE/); // ensure we don't accidentally match LIKE
    });

    it('emits LIKE (not ILIKE) on mysql for $contL', () => {
      const captured = runBuild('mysql', { name: { $contL: 'foo' } });
      const sql = captured.conditions.map((c) => c.str).join(' ');
      expect(sql).toMatch(/LIKE/);
      expect(sql).not.toMatch(/ILIKE/);
    });

    it('emits LIKE (not ILIKE) on mariadb for $contL', () => {
      const captured = runBuild('mariadb', { name: { $contL: 'foo' } });
      const sql = captured.conditions.map((c) => c.str).join(' ');
      expect(sql).toMatch(/LIKE/);
      expect(sql).not.toMatch(/ILIKE/);
    });

    it('emits LIKE (not ILIKE) on better-sqlite3 for $startsL', () => {
      const captured = runBuild('better-sqlite3', { name: { $startsL: 'foo' } });
      const sql = captured.conditions.map((c) => c.str).join(' ');
      expect(sql).toMatch(/LIKE/);
      expect(sql).not.toMatch(/ILIKE/);
    });
  });

  describe('identifier quoting dialect detection (L398 pragma sweep)', () => {
    it('uses double-quote identifiers on postgres', () => {
      const captured = runBuild('postgres', { name: 'foo' });
      const sql = captured.conditions.map((c) => c.str).join(' ');
      expect(sql).toMatch(/"MockEntity"\."name"/);
    });

    it('uses backtick identifiers on mysql', () => {
      const captured = runBuild('mysql', { name: 'foo' });
      const sql = captured.conditions.map((c) => c.str).join(' ');
      expect(sql).toMatch(/`MockEntity`\.`name`/);
    });

    it('uses backtick identifiers on mariadb', () => {
      const captured = runBuild('mariadb', { name: 'foo' });
      const sql = captured.conditions.map((c) => c.str).join(' ');
      expect(sql).toMatch(/`MockEntity`\.`name`/);
    });

    it('uses double-quote identifiers on better-sqlite3 (default fallback)', () => {
      const captured = runBuild('better-sqlite3', { name: 'foo' });
      const sql = captured.conditions.map((c) => c.str).join(' ');
      expect(sql).toMatch(/"MockEntity"\."name"/);
    });
  });
});
