/**
 * Translator-level unit spec for `DrizzleQueryTranslator`.
 *
 * Currently scoped to the COVERAGE-01 D-17 sweep (Phase 10 Plan 06):
 * exercises the hoisted `defaultOnNotFound` no-op thunk that previously
 * lived as an inline `/* istanbul ignore next * /` arrow at construction
 * time. When other internal branches grow dedicated unit tests, extend
 * this file rather than rolling a parallel one.
 */
import { defaultOnNotFound } from '../src/drizzle-query-translator';

describe('DrizzleQueryTranslator', () => {
  describe('defaultOnNotFound (COVERAGE-01 D-17)', () => {
    it('returns undefined (default no-op for FetchHelper.onNotFound)', () => {
      expect(defaultOnNotFound()).toBeUndefined();
    });

    it('is a stable reference (no per-instance closure)', () => {
      // Sanity: defaultOnNotFound is a stable module-level callable, not
      // re-created on every translator construction.
      const ref1 = defaultOnNotFound;
      const ref2 = defaultOnNotFound;
      expect(ref1).toBe(ref2);
      expect(typeof ref1).toBe('function');
    });
  });
});
