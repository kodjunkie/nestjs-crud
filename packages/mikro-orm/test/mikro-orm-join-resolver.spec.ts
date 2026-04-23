/**
 * @description Unit spec for `MikroOrmJoinResolver.getAllowedColumnsFor` +
 * `applyJoins`. Mirrors the shape of
 * `packages/typeorm/test/typeorm-join-resolver.spec.ts`.
 *
 * The MikroORM resolver is the D-05b dotted-path SQLi gate: its
 * `getAllowedColumnsFor(relation)` feeds the translator's mapSort
 * allowlist. A zero-size Set MUST short-circuit to `onBadRequest` upstream.
 *
 * Behaviours covered:
 *   1. getAllowedColumnsFor('knownRelation')     → non-empty Set
 *   2. getAllowedColumnsFor('knownRelation.col') → falls back via root segment
 *   3. getAllowedColumnsFor('unknownRelation')   → empty Set
 *   4. applyJoins populates relation via populate() on valid known join
 *   5. applyJoins silently skips unknown relation (matches TypeORM contract;
 *      upstream translator gate is the throwing surface)
 *
 * di-scope-awareness: ORM em is the test fixture; resolver itself is
 * metadata-bound and em-independent.
 */
import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { Collection, EntitySchema, Ref } from '@mikro-orm/core';
import { MikroORM } from '@mikro-orm/sqlite';

import { MikroOrmJoinResolver } from '../src/mikro-orm-join-resolver';

// CONTRACT: throwing stub — never `jest.fn()` on a security path.
const throwingOnBadRequest = (msg: string): never => {
  throw new BadRequestException(msg);
};

class JrCompany {
  id!: number;

  name?: string;

  users = new Collection<JrUser>(this);
}

class JrUser {
  id!: number;

  name?: string;

  company?: Ref<JrCompany>;
}

const JrCompanySchema = new EntitySchema<JrCompany>({
  class: JrCompany,
  tableName: 'jr_companies',
  properties: {
    id: { primary: true, type: 'number' },
    name: { type: 'string', nullable: true },
    users: { kind: '1:m', entity: () => JrUser, mappedBy: 'company' },
  },
});

const JrUserSchema = new EntitySchema<JrUser>({
  class: JrUser,
  tableName: 'jr_users',
  properties: {
    id: { primary: true, type: 'number' },
    name: { type: 'string', nullable: true },
    company: { kind: 'm:1', entity: () => JrCompany, ref: true, nullable: true },
  },
});

describe('MikroOrmJoinResolver', () => {
  let orm: MikroORM;
  let resolver: MikroOrmJoinResolver;

  beforeAll(async () => {
    orm = await MikroORM.init({
      entities: [JrUserSchema, JrCompanySchema],
      dbName: ':memory:',
      allowGlobalContext: true,
    });
    await orm.schema.create();
  });

  afterAll(async () => {
    if (orm) await orm.close(true);
  });

  beforeEach(() => {
    const userMeta = orm.em.getMetadata().get(JrUser);
    resolver = new MikroOrmJoinResolver({
      metadata: userMeta,
      onBadRequest: throwingOnBadRequest,
    });
  });

  describe('getAllowedColumnsFor', () => {
    it('returns a non-empty Set for a known relation', () => {
      const cols = resolver.getAllowedColumnsFor('company');
      expect(cols).toBeInstanceOf(Set);
      expect(cols.size).toBeGreaterThan(0);
      expect(cols.has('name')).toBe(true);
    });

    it('falls back to the root segment of a dotted path when exact field is unknown', () => {
      const cols = resolver.getAllowedColumnsFor('company.name');
      expect(cols.has('name')).toBe(true);
    });

    it('returns an empty Set for an unknown relation', () => {
      const cols = resolver.getAllowedColumnsFor('doesNotExist');
      expect(cols).toBeInstanceOf(Set);
      expect(cols.size).toBe(0);
    });
  });

  describe('applyJoins', () => {
    it('invokes populate() on a known eager relation', () => {
      const populate = jest.fn();
      const query: any = { populate };

      resolver.applyJoins(query, [{ field: 'company' }], { company: { eager: true } });

      expect(populate).toHaveBeenCalledWith(['company']);
    });

    it('silently skips an unknown relation (no throw; no populate call)', () => {
      const populate = jest.fn();
      const query: any = { populate };

      expect(() => resolver.applyJoins(query, [{ field: 'ghost' }], { ghost: { eager: true } })).not.toThrow();
      expect(populate).not.toHaveBeenCalled();
    });
  });

  describe('applyJoins eager flag (COVERAGE-01 D-17 sweep — non-eager else branch)', () => {
    it('takes the non-eager branch when options.eager is false (no populate during eager pass; not appliedJoins)', () => {
      // Branch under test: line 48's `if (options.eager)` — the else
      // case is hit when `options.eager === false`. With NO entries in
      // `joins[]`, the second (client-requested) loop is also inert,
      // so populate() must remain uncalled. This proves the eager loop
      // skipped the relation purely on the `eager: false` branch.
      const populate = jest.fn();
      const query: any = { populate };

      const result = resolver.applyJoins(query, [], { company: { eager: false } });

      expect(populate).not.toHaveBeenCalled();
      expect(result).toBe(query);
    });

    it('also takes the non-eager branch when options.eager is undefined (falsy)', () => {
      // Same else branch, exercised via the "missing eager flag" path.
      const populate = jest.fn();
      const query: any = { populate };

      resolver.applyJoins(query, [], { company: {} });

      expect(populate).not.toHaveBeenCalled();
    });

    it('still applies a non-eager relation when explicitly requested via joins[] (client-requested path remains live)', () => {
      // Regression guard: the else-branch must NOT prevent the second
      // loop from applying the same relation when the client asks for
      // it via `?join=company`. Proves the else-branch only affects the
      // eager auto-pass, not the client-requested override.
      const populate = jest.fn();
      const query: any = { populate };

      resolver.applyJoins(query, [{ field: 'company' }], { company: { eager: false } });

      expect(populate).toHaveBeenCalledWith(['company']);
    });
  });
});
