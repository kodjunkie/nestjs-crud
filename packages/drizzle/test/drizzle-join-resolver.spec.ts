/**
 * Nyquist allowlist spec for `DrizzleJoinResolver.getAllowedColumnsFor`.
 * Mirrors the shape of `packages/typeorm/test/map-sort-allowlist.spec.ts`
 * (hit/miss matrix for dotted-path sort allowlist — the SQLi
 * mitigation surface). Unknown relation OR unknown relation-column is
 * rejected BEFORE the identifier reaches Drizzle's SQL builder.
 *
 * Harness contract: `onBadRequest` on the resolver is a throwing stub —
 * callers MUST treat an empty allowed-set as rejection.
 */
import { BadRequestException } from '@nestjs/common';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { DrizzleJoinResolver } from '../src/drizzle-join-resolver';

const throwingOnBadRequest = (msg: string): never => {
  throw new BadRequestException(msg);
};

const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  name: text('name'),
});

const profile = sqliteTable('profile', {
  id: integer('id').primaryKey(),
  bio: text('bio'),
  userId: integer('user_id'),
});

const projects = sqliteTable('projects', {
  id: integer('id').primaryKey(),
  title: text('title'),
  ownerId: integer('owner_id'),
});

const licenses = sqliteTable('licenses', {
  id: integer('id').primaryKey(),
  code: text('code'),
  profileId: integer('profile_id'),
});

describe('DrizzleJoinResolver.getAllowedColumnsFor (dotted-path SQLi allowlist)', () => {
  let resolver: DrizzleJoinResolver;

  beforeEach(() => {
    resolver = new DrizzleJoinResolver({
      relationsConfig: {
        profile: {
          table: profile,
          foreignKey: profile.userId,
          referenceKey: users.id,
        },
        projects: {
          table: projects,
          foreignKey: projects.ownerId,
          referenceKey: users.id,
        },
      },
      onBadRequest: throwingOnBadRequest,
    });
  });

  describe('known relation', () => {
    it('returns non-empty set for a known flat relation', () => {
      const allowed = resolver.getAllowedColumnsFor('profile');
      expect(allowed.size).toBeGreaterThan(0);
    });

    it('contains the declared columns for a known relation', () => {
      const allowed = resolver.getAllowedColumnsFor('profile');
      expect(allowed.has('id')).toBe(true);
      expect(allowed.has('bio')).toBe(true);
      expect(allowed.has('userId')).toBe(true);
    });

    it('resolves dotted-path by the leading segment', () => {
      const allowed = resolver.getAllowedColumnsFor('profile.bio');
      expect(allowed.has('bio')).toBe(true);
    });

    it('returns allowed-set for a second declared relation', () => {
      const allowed = resolver.getAllowedColumnsFor('projects');
      expect(allowed.has('title')).toBe(true);
    });
  });

  describe('unknown relation', () => {
    it('returns an empty set for an unknown relation', () => {
      const allowed = resolver.getAllowedColumnsFor('ghost');
      expect(allowed.size).toBe(0);
    });

    it('returns an empty set for an injection-shaped relation', () => {
      const allowed = resolver.getAllowedColumnsFor('profile; DROP TABLE users--');
      expect(allowed.size).toBe(0);
    });

    it('returns an empty set for a dotted-path with unknown leading segment', () => {
      const allowed = resolver.getAllowedColumnsFor('unknown.col');
      expect(allowed.size).toBe(0);
    });
  });

  describe('known relation + unknown column (caller responsibility)', () => {
    it('does NOT include the unknown column in the allowed-set', () => {
      const allowed = resolver.getAllowedColumnsFor('profile');
      expect(allowed.has('ssn')).toBe(false);
    });

    it('does NOT include injection-shaped column in the allowed-set', () => {
      const allowed = resolver.getAllowedColumnsFor('profile');
      expect(allowed.has("bio'; UPDATE users SET")).toBe(false);
    });
  });
});

describe('applyJoins — nested join ancestry', () => {
  function createRecordingQuery() {
    const calls: unknown[] = [];
    const query: any = {};
    query.leftJoin = jest.fn((table: unknown) => {
      calls.push(table);
      return query;
    });
    query.innerJoin = jest.fn((table: unknown) => {
      calls.push(table);
      return query;
    });
    return { query, calls };
  }

  function createNestedResolver() {
    return new DrizzleJoinResolver({
      relationsConfig: {
        profile: {
          table: profile,
          foreignKey: profile.userId,
          referenceKey: users.id,
        },
        'profile.licenses': {
          table: licenses,
          foreignKey: licenses.profileId,
          referenceKey: profile.id,
        },
      },
      onBadRequest: throwingOnBadRequest,
    });
  }

  it("throws before any join is applied when the nested join's parent is not joined", () => {
    const resolver = createNestedResolver();
    const { query, calls } = createRecordingQuery();

    expect(() =>
      resolver.applyJoins(query, [{ field: 'profile.licenses' }], { profile: {}, 'profile.licenses': {} }),
    ).toThrow(new BadRequestException("Invalid join: 'profile.licenses'"));
    expect(query.leftJoin).not.toHaveBeenCalled();
    expect(query.innerJoin).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('applies ancestors before descendants regardless of request order', () => {
    const resolver = createNestedResolver();
    const { query, calls } = createRecordingQuery();

    resolver.applyJoins(query, [{ field: 'profile.licenses' }, { field: 'profile' }], {
      profile: {},
      'profile.licenses': {},
    });

    expect(calls).toEqual([profile, licenses]);
  });

  it('applies both joins with no throw when the parent is eager', () => {
    const resolver = createNestedResolver();
    const { query, calls } = createRecordingQuery();

    resolver.applyJoins(query, [{ field: 'profile.licenses' }], {
      profile: { eager: true },
      'profile.licenses': {},
    });

    expect(calls).toEqual([profile, licenses]);
  });

  it('throws when an eager nested join has an unjoined parent', () => {
    const resolver = createNestedResolver();
    const { query } = createRecordingQuery();

    expect(() =>
      resolver.applyJoins(query, [], {
        profile: {},
        'profile.licenses': { eager: true },
      }),
    ).toThrow(new BadRequestException("Invalid join: 'profile.licenses'"));
  });

  it('reports the deepest orphan at any depth with no join calls', () => {
    const resolver = createNestedResolver();
    const { query, calls } = createRecordingQuery();

    expect(() =>
      resolver.applyJoins(query, [{ field: 'profile' }, { field: 'profile.licenses.issuer' }], {
        profile: {},
        'profile.licenses': {},
        'profile.licenses.issuer': {},
      }),
    ).toThrow(new BadRequestException("Invalid join: 'profile.licenses.issuer'"));
    expect(calls).toHaveLength(0);
  });

  it('silently ignores a dotted join that is not in the allowlist', () => {
    const resolver = createNestedResolver();
    const { query, calls } = createRecordingQuery();

    expect(() =>
      resolver.applyJoins(query, [{ field: 'profile' }, { field: 'profile.licenses' }], {
        profile: {},
      }),
    ).not.toThrow();
    expect(calls).toEqual([profile]);
  });
});
