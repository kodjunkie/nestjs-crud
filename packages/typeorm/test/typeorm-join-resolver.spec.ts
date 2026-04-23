import { JoinOptions } from '@nestjs-crud/core';
import { QueryJoin } from '@nestjs-crud/request';
import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';

import { TypeOrmJoinResolver } from '../src/typeorm-join-resolver';
import { JrLicense, JrProfile, JrProject, JrTask, JrUser } from './__fixture__/join-entities';

const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();

const joinAliases = (qb: SelectQueryBuilder<any>): string[] => qb.expressionMap.joinAttributes.map((j) => j.alias.name);

const joinMap = (qb: SelectQueryBuilder<any>): Record<string, { relation: string; direction: string }> => {
  const out: Record<string, { relation: string; direction: string }> = {};
  for (const j of qb.expressionMap.joinAttributes) {
    out[j.alias.name] = {
      relation: typeof j.entityOrProperty === 'string' ? j.entityOrProperty : String(j.entityOrProperty),
      direction: j.direction,
    };
  }
  return out;
};

describe('TypeOrmJoinResolver', () => {
  let dataSource: DataSource;
  let userRepo: Repository<JrUser>;
  let onBadRequest: jest.Mock;
  let resolver: TypeOrmJoinResolver<JrUser>;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [JrUser, JrProfile, JrLicense, JrProject, JrTask],
      synchronize: true,
      dropSchema: true,
    });
    await dataSource.initialize();
    userRepo = dataSource.getRepository(JrUser);
  });

  afterAll(async () => {
    if (dataSource && dataSource.isInitialized) await dataSource.destroy();
  });

  beforeEach(() => {
    onBadRequest = jest.fn();
    resolver = new TypeOrmJoinResolver<JrUser>(userRepo, { onBadRequest });
  });

  const qb = (): SelectQueryBuilder<JrUser> => userRepo.createQueryBuilder('JrUser');

  // ---------------------------------------------------------------------------
  // Flat joins
  // ---------------------------------------------------------------------------
  describe('applyJoins — flat', () => {
    it('returns the query unchanged when joinOptions is empty', () => {
      const builder = qb();
      const before = norm(builder.getQuery());
      const out = resolver.applyJoins(builder, [], {});
      expect(out).toBe(builder);
      expect(norm(builder.getQuery())).toBe(before);
      expect(builder.expressionMap.joinAttributes).toHaveLength(0);
    });

    it('returns the query unchanged when joins is empty and no eager options', () => {
      const builder = qb();
      const joinOptions: JoinOptions = { profile: {} };
      resolver.applyJoins(builder, [], joinOptions);
      expect(builder.expressionMap.joinAttributes).toHaveLength(0);
    });

    it('adds a LEFT JOIN for a client-requested flat relation', () => {
      const builder = qb();
      const joins: QueryJoin[] = [{ field: 'profile' }];
      const joinOptions: JoinOptions = { profile: {} };
      resolver.applyJoins(builder, joins, joinOptions);
      expect(joinAliases(builder)).toEqual(['profile']);
      expect(joinMap(builder).profile.direction).toBe('LEFT');
    });

    it('emits INNER JOIN when joinOption.required is true', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }], { profile: { required: true } });
      expect(joinMap(builder).profile.direction).toBe('INNER');
    });

    it('honors joinOption.alias when provided', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }], { profile: { alias: 'prof' } });
      expect(joinAliases(builder)).toEqual(['prof']);
    });

    it('selects all columns (+ primary) by default for a joined relation', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }], { profile: {} });
      const sql = norm(builder.getQuery());
      expect(sql).toMatch(/"profile"\."id"/);
      expect(sql).toMatch(/"profile"\."name"/);
      expect(sql).toMatch(/"profile"\."bio"/);
    });

    it('narrows the select list when QueryJoin.select is provided', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile', select: ['name'] }], { profile: {} });
      const sql = norm(builder.getQuery());
      expect(sql).toMatch(/"profile"\."name"/);
      expect(sql).toMatch(/"profile"\."id"/); // primary still added
      expect(sql).not.toMatch(/"profile"\."bio"/);
    });

    it('ignores columns in QueryJoin.select that are not in allowedColumns', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile', select: ['name', 'ghost'] }], { profile: { allow: ['name'] } });
      const sql = norm(builder.getQuery());
      expect(sql).toMatch(/"profile"\."name"/);
      expect(sql).not.toMatch(/ghost/);
    });

    it('applies joinOption.allow to restrict selectable columns', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }], { profile: { allow: ['name'] } });
      const sql = norm(builder.getQuery());
      expect(sql).toMatch(/"profile"\."name"/);
      expect(sql).not.toMatch(/"profile"\."bio"/);
    });

    it('applies joinOption.exclude to drop columns from select', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }], { profile: { exclude: ['bio'] } });
      const sql = norm(builder.getQuery());
      expect(sql).toMatch(/"profile"\."name"/);
      expect(sql).not.toMatch(/"profile"\."bio"/);
    });

    it('adds joinOption.persist columns to the select list unconditionally', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile', select: ['name'] }], { profile: { persist: ['bio'] } });
      const sql = norm(builder.getQuery());
      expect(sql).toMatch(/"profile"\."bio"/);
      expect(sql).toMatch(/"profile"\."name"/);
    });

    it('adds the join without any extra select when joinOption.select === false', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }], { profile: { select: false } });
      const sql = norm(builder.getQuery());
      expect(joinAliases(builder)).toEqual(['profile']);
      expect(sql).not.toMatch(/"profile"\."name"/);
      expect(sql).not.toMatch(/"profile"\."bio"/);
    });

    it('silently skips an unknown relation (does NOT invoke onBadRequest)', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'unknownRel' }], { unknownRel: {} });
      expect(builder.expressionMap.joinAttributes).toHaveLength(0);
      expect(onBadRequest).not.toHaveBeenCalled();
    });

    it('skips a join whose field is not present in joinOptions', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }], {});
      expect(builder.expressionMap.joinAttributes).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Eager joins
  // ---------------------------------------------------------------------------
  describe('applyJoins — eager', () => {
    it('auto-adds a join for an eager option even when joins[] is empty', () => {
      const builder = qb();
      resolver.applyJoins(builder, [], { profile: { eager: true } });
      expect(joinAliases(builder)).toEqual(['profile']);
    });

    it('does not duplicate an eager relation that is also in joins[]', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }], { profile: { eager: true } });
      expect(joinAliases(builder).filter((a) => a === 'profile')).toHaveLength(1);
    });

    it('uses client-provided select list for an eager join when also requested', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile', select: ['name'] }], { profile: { eager: true } });
      const sql = norm(builder.getQuery());
      expect(sql).toMatch(/"profile"\."name"/);
      expect(sql).not.toMatch(/"profile"\."bio"/);
    });

    it('adds multiple eager joins in joinOptions order', () => {
      const builder = qb();
      resolver.applyJoins(builder, [], { profile: { eager: true }, projects: { eager: true } });
      expect(joinAliases(builder)).toEqual(['profile', 'projects']);
    });
  });

  // ---------------------------------------------------------------------------
  // Nested joins — 1 level
  // ---------------------------------------------------------------------------
  describe('applyJoins — nested 1-level', () => {
    it('applies a `profile.licenses` nested join once the parent join is seeded', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }, { field: 'profile.licenses' }], {
        profile: {},
        'profile.licenses': {},
      });
      const aliases = joinAliases(builder);
      expect(aliases).toContain('profile');
      expect(aliases).toContain('licenses');
    });

    it('applies nested join via eager parent + eager nested', () => {
      const builder = qb();
      resolver.applyJoins(builder, [], { profile: { eager: true }, 'profile.licenses': { eager: true } });
      const aliases = joinAliases(builder);
      expect(aliases).toContain('profile');
      expect(aliases).toContain('licenses');
    });

    it('narrows select on nested relation when QueryJoin.select provided', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }, { field: 'profile.licenses', select: ['code'] }], {
        profile: {},
        'profile.licenses': {},
      });
      const sql = norm(builder.getQuery());
      expect(sql).toMatch(/"licenses"\."code"/);
      expect(sql).toMatch(/"licenses"\."id"/); // primary
    });

    it('honors alias on nested join when specified in joinOptions', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }, { field: 'profile.licenses' }], {
        profile: {},
        'profile.licenses': { alias: 'lic' },
      });
      expect(joinAliases(builder)).toContain('lic');
    });

    it('throws a low-level TypeORM error when nested join requested without parent seeded (current behavior)', () => {
      // Requesting 'profile.licenses' without seeding 'profile' leaves allowedRelation.path
      // undefined (parent not in entityRelationsHash). This is a known brittleness of the
      // pre-refactor setJoin that the VERBATIM port preserves.
      const builder = qb();
      expect(() => resolver.applyJoins(builder, [{ field: 'profile.licenses' }], { 'profile.licenses': {} })).toThrow();
      expect(onBadRequest).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // Nested joins — 2 levels
  // ---------------------------------------------------------------------------
  describe('applyJoins — nested 2-level', () => {
    it('applies `projects.tasks` chain given parent join seeded', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'projects' }, { field: 'projects.tasks' }], {
        projects: {},
        'projects.tasks': {},
      });
      const aliases = joinAliases(builder);
      expect(aliases).toContain('projects');
      expect(aliases).toContain('tasks');
    });

    it('produces both joins in client-requested order', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'projects' }, { field: 'projects.tasks' }], {
        projects: {},
        'projects.tasks': {},
      });
      const aliases = joinAliases(builder);
      expect(aliases.indexOf('projects')).toBeLessThan(aliases.indexOf('tasks'));
    });

    it('applies eager chain without client input', () => {
      const builder = qb();
      resolver.applyJoins(builder, [], { projects: { eager: true }, 'projects.tasks': { eager: true } });
      const aliases = joinAliases(builder);
      expect(aliases).toContain('projects');
      expect(aliases).toContain('tasks');
    });
  });

  // ---------------------------------------------------------------------------
  // Cache / parentPath alias
  // ---------------------------------------------------------------------------
  describe('applyJoins — cache and alias propagation', () => {
    it('caches resolved relation metadata across calls (no duplicate joins on 2nd call)', () => {
      const builder1 = qb();
      resolver.applyJoins(builder1, [{ field: 'profile' }], { profile: {} });
      const builder2 = qb();
      resolver.applyJoins(builder2, [{ field: 'profile' }], { profile: {} });
      expect(joinAliases(builder2)).toEqual(['profile']);
    });

    it('registers joinOption.alias as a secondary cache key', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }], { profile: { alias: 'prof' } });
      // Second lookup via the alias should return cached entry (no throw)
      const cols = resolver.getAllowedColumnsFor('prof');
      expect(cols.size).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getAllowedColumnsFor
  // ---------------------------------------------------------------------------
  describe('getAllowedColumnsFor', () => {
    it('returns an empty set for a field that was never joined', () => {
      const set = resolver.getAllowedColumnsFor('profile');
      expect(set.size).toBe(0);
    });

    it('returns the allowed column set after a flat join is applied', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }], { profile: {} });
      const cols = resolver.getAllowedColumnsFor('profile');
      expect(cols.has('name')).toBe(true);
      expect(cols.has('bio')).toBe(true);
    });

    it('respects joinOption.allow when reporting allowed columns', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }], { profile: { allow: ['name'] } });
      const cols = resolver.getAllowedColumnsFor('profile');
      expect(cols.has('name')).toBe(true);
      expect(cols.has('bio')).toBe(false);
    });

    it('respects joinOption.exclude when reporting allowed columns', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }], { profile: { exclude: ['bio'] } });
      const cols = resolver.getAllowedColumnsFor('profile');
      expect(cols.has('name')).toBe(true);
      expect(cols.has('bio')).toBe(false);
    });

    it('falls back to the root segment of a dotted path when exact field is unknown', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }], { profile: {} });
      // Exact key 'profile.something' is not in the hash, but 'profile' is.
      const cols = resolver.getAllowedColumnsFor('profile.something');
      expect(cols.has('name')).toBe(true);
    });

    it('returns a ReadonlySet (Set instance) even for unknown fields', () => {
      const cols = resolver.getAllowedColumnsFor('doesNotExist');
      expect(cols).toBeInstanceOf(Set);
      expect(cols.size).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Pragma-sweep branch coverage — explicit tests for sites where
  // istanbul-ignore pragmas were previously suppressing coverage. (Existing
  // tests above also exercise these branches; the cases below pin the contract.)
  // ---------------------------------------------------------------------------
  describe('applyJoins — eager-flag branch coverage (L42 sweep)', () => {
    it('skips the eager auto-add path for non-eager joinOptions', () => {
      const builder = qb();
      // joinOptions has `profile` but eager is unset/falsy — the eager loop
      // must NOT auto-seed `profile`; only the client-requested join below adds it.
      resolver.applyJoins(builder, [], { profile: { eager: false }, projects: { eager: false } });
      expect(builder.expressionMap.joinAttributes).toHaveLength(0);
    });

    it('only the eager-flagged option is auto-added when mixed with non-eager', () => {
      const builder = qb();
      resolver.applyJoins(builder, [], { profile: { eager: true }, projects: { eager: false } });
      expect(joinAliases(builder)).toEqual(['profile']);
    });
  });

  describe('applyJoins — !eagerJoins[field] branch coverage (L54 sweep)', () => {
    it('client-requested join is applied when no eager joins exist', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }], { profile: {} });
      expect(joinAliases(builder)).toEqual(['profile']);
    });

    it('client-requested join skipped when same field was already eager-loaded', () => {
      const builder = qb();
      // `profile` is eager AND in client joins — must appear exactly once.
      resolver.applyJoins(builder, [{ field: 'profile' }], { profile: { eager: true } });
      expect(joinAliases(builder).filter((a) => a === 'profile')).toHaveLength(1);
    });
  });

  describe('applyJoins — parentAllowedRelation truthy branch coverage (L142 sweep)', () => {
    it('nested join with seeded parent resolves path via parentAllowedRelation cache hit', () => {
      const builder = qb();
      // Seeding `profile` first populates entityRelationsHash; then the nested
      // `profile.licenses` resolution must hit the truthy `parentAllowedRelation`
      // branch (not the unseeded-parent error path).
      resolver.applyJoins(builder, [{ field: 'profile' }, { field: 'profile.licenses' }], {
        profile: {},
        'profile.licenses': {},
      });
      const aliases = joinAliases(builder);
      expect(aliases).toContain('profile');
      expect(aliases).toContain('licenses');
    });

    it('nested join with seeded parent + alias propagates parent alias into nested path', () => {
      const builder = qb();
      resolver.applyJoins(builder, [{ field: 'profile' }, { field: 'profile.licenses' }], {
        profile: { alias: 'prof' },
        'profile.licenses': {},
      });
      const aliases = joinAliases(builder);
      expect(aliases).toContain('prof');
      expect(aliases).toContain('licenses');
    });
  });
});
