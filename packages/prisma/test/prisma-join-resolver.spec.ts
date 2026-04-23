import { PrismaJoinResolver } from '../src/prisma-join-resolver';

const relationFields = ['company', 'projects'];
const allowedColumnsByRelation: Record<string, string[]> = {
  company: ['id', 'name', 'domain', 'deletedAt'],
  projects: ['id', 'name', 'companyId'],
};

const makeResolver = (): PrismaJoinResolver =>
  new PrismaJoinResolver({ relationFields, allowedColumnsByRelation });

describe('PrismaJoinResolver', () => {
  describe('getAllowedColumnsFor (D-05b SQLi mitigation surface)', () => {
    it('returns the configured column set for a known relation', () => {
      const resolver = makeResolver();
      const cols = resolver.getAllowedColumnsFor('company');
      expect(cols.has('id')).toBe(true);
      expect(cols.has('name')).toBe(true);
      expect(cols.has('domain')).toBe(true);
      expect(cols.has('deletedAt')).toBe(true);
      expect(cols.size).toBe(4);
    });

    it('returns an empty set for an unknown relation (defense-in-depth)', () => {
      const resolver = makeResolver();
      const cols = resolver.getAllowedColumnsFor('unknownRelation');
      expect(cols.size).toBe(0);
    });
  });

  describe('isKnownRelation', () => {
    it('returns true for a configured relation', () => {
      const resolver = makeResolver();
      expect(resolver.isKnownRelation('company')).toBe(true);
      expect(resolver.isKnownRelation('projects')).toBe(true);
    });

    it('returns false for an unknown relation', () => {
      const resolver = makeResolver();
      expect(resolver.isKnownRelation('unknownRelation')).toBe(false);
    });
  });

  describe('applyJoins (intentional throw — Prisma uses include, not joins) — COVERAGE-01 D-17 sweep', () => {
    it('throws explaining the contract — Prisma never invokes this path', () => {
      const resolver = makeResolver();
      expect(() => resolver.applyJoins({} as any, [], {})).toThrow(
        /not needed for Prisma — relation navigation happens via include in PrismaQueryComposer/,
      );
    });

    it('still throws even when called with non-empty joins arg (the throw is unconditional)', () => {
      const resolver = makeResolver();
      expect(() =>
        resolver.applyJoins({} as any, [{ field: 'company', select: [] }], { company: { eager: true } }),
      ).toThrow(/not needed for Prisma/);
    });
  });
});
