import { ancestorPaths, findOrphanJoin, invalidJoinMessage } from '../src/join-ancestry';

describe('join-ancestry', () => {
  describe('ancestorPaths', () => {
    it('returns every proper dotted prefix, shallow to deep', () => {
      expect(ancestorPaths('a.b.c')).toEqual(['a', 'a.b']);
    });

    it('returns an empty array for a top-level field', () => {
      expect(ancestorPaths('a')).toEqual([]);
    });
  });

  describe('findOrphanJoin', () => {
    it('returns undefined for an empty array', () => {
      expect(findOrphanJoin([])).toBeUndefined();
    });

    it('returns undefined when every ancestor is present', () => {
      expect(findOrphanJoin(['a.b', 'a'])).toBeUndefined();
    });

    it('returns the field whose ancestor is missing', () => {
      expect(findOrphanJoin(['a.b.c', 'a'])).toBe('a.b.c');
    });

    it('does not treat a string prefix as an ancestor (segment boundaries only)', () => {
      expect(findOrphanJoin(['ab', 'a.b'])).toBe('a.b');
    });

    it('reports the first orphan in array order', () => {
      expect(findOrphanJoin(['x.y', 'p.q'])).toBe('x.y');
    });
  });

  describe('invalidJoinMessage', () => {
    it('formats the orphan-join rejection message', () => {
      expect(invalidJoinMessage('profile.licenses')).toBe("Invalid join: 'profile.licenses'");
    });
  });
});
