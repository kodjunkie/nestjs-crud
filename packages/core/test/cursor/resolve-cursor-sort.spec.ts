import { resolveCursorSort } from '@nestjs-crud/core/cursor';

const LOCKED_PREFIX = 'Cursor pagination supports a single sort field';

describe('resolveCursorSort', () => {
  describe('client sort present', () => {
    it('resolves to the single client-supplied field, ignoring a differing route default', () => {
      const result = resolveCursorSort(
        { sort: [{ field: 'email', order: 'ASC' }] },
        { sort: [{ field: 'id', order: 'DESC' }] },
      );
      expect(result.error).toBeNull();
      expect(result.sort).toEqual({ field: 'email', order: 'ASC' });
    });

    it('yields no resolved sort and an error naming the request as the origin when 2+ fields are supplied', () => {
      const result = resolveCursorSort({
        sort: [
          { field: 'id', order: 'ASC' },
          { field: 'createdAt', order: 'DESC' },
        ],
      });
      expect(result.sort).toBeNull();
      expect(result.error).toMatch(/request query string/);
      expect(result.error).toContain('2');
    });
  });

  describe('no client sort, route default present', () => {
    it('resolves to the single-field route default, ascending', () => {
      const result = resolveCursorSort({}, { sort: [{ field: 'companyId', order: 'ASC' }] });
      expect(result.error).toBeNull();
      expect(result.sort).toEqual({ field: 'companyId', order: 'ASC' });
    });

    it('resolves to the single-field route default, descending', () => {
      const result = resolveCursorSort({}, { sort: [{ field: 'companyId', order: 'DESC' }] });
      expect(result.error).toBeNull();
      expect(result.sort).toEqual({ field: 'companyId', order: 'DESC' });
    });

    it('yields no resolved sort and an error naming the route default as the origin when 2+ fields are declared, and never selects the first element', () => {
      const routeDefault = [
        { field: 'id', order: 'ASC' as const },
        { field: 'companyId', order: 'ASC' as const },
      ];
      const result = resolveCursorSort({}, { sort: routeDefault });
      expect(result.sort).toBeNull();
      expect(result.error).toMatch(/@Crud\(\{ query: \{ sort \} \}\)/);
      expect(result.error).toContain('2');
      // Not silently resolved to routeDefault[0] (D-03) — sort stays null.
      expect(result.sort).not.toEqual(routeDefault[0]);
    });
  });

  describe('neither client sort nor route default present', () => {
    it('yields no resolved sort and an error naming both remedies', () => {
      const result = resolveCursorSort({});
      expect(result.sort).toBeNull();
      expect(result.error).toMatch(/\?sort=/);
      expect(result.error).toMatch(/@Crud\(\{ query: \{ sort \} \}\)/);
    });

    it('tolerates an undefined route options argument entirely', () => {
      const result = resolveCursorSort({ sort: [] }, undefined);
      expect(result.sort).toBeNull();
      expect(result.error).toMatch(/\?sort=/);
    });
  });

  describe('empty-array treated as absent', () => {
    it('treats an empty client sort array the same as absent, falling through to the route default', () => {
      const result = resolveCursorSort({ sort: [] }, { sort: [{ field: 'id', order: 'ASC' }] });
      expect(result.error).toBeNull();
      expect(result.sort).toEqual({ field: 'id', order: 'ASC' });
    });

    it('treats an empty route default array the same as absent, yielding the no-sort-anywhere error', () => {
      const result = resolveCursorSort({}, { sort: [] });
      expect(result.sort).toBeNull();
      expect(result.error).toMatch(/\?sort=/);
    });
  });

  describe('locked message content', () => {
    it('every error message begins with the exact locked prefix', () => {
      const messages = [
        resolveCursorSort({
          sort: [
            { field: 'id', order: 'ASC' },
            { field: 'createdAt', order: 'DESC' },
          ],
        }).error,
        resolveCursorSort(
          {},
          {
            sort: [
              { field: 'id', order: 'ASC' },
              { field: 'companyId', order: 'ASC' },
            ],
          },
        ).error,
        resolveCursorSort({}).error,
      ];
      for (const message of messages) {
        expect(message).not.toBeNull();
        expect(message?.startsWith(LOCKED_PREFIX)).toBe(true);
      }
    });

    it('no produced message contains the legacy count-suffix wording', () => {
      const messages = [
        resolveCursorSort({
          sort: [
            { field: 'id', order: 'ASC' },
            { field: 'createdAt', order: 'DESC' },
          ],
        }).error,
        resolveCursorSort(
          {},
          {
            sort: [
              { field: 'id', order: 'ASC' },
              { field: 'companyId', order: 'ASC' },
            ],
          },
        ).error,
        resolveCursorSort({}).error,
      ];
      for (const message of messages) {
        expect(message).not.toMatch(/got:/);
      }
    });
  });
});
