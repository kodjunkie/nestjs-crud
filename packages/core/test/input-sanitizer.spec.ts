import { BadRequestException } from '@nestjs/common';
import { InputSanitizer } from '../src/util/input-sanitizer';

describe('InputSanitizer', () => {
  const allowedColumns = new Set(['id', 'name', 'email', 'profile']);

  // Three distinct injection patterns — representative of pre-v2 denylist triggers.
  // In v2.0 pure-allowlist mode these are rejected identically to any unknown field.
  const injectionInputs: ReadonlyArray<string> = ["foo' OR '1'='1", "bar' UNION SELECT", 'baz--DROP TABLE'];

  // CONTRACT (per InputSanitizer interface JSDoc on `assert`):
  // `onBadRequest` MUST throw. A no-op `jest.fn()` would let `assert` return
  // silently on a miss — a security bug masked by the test harness. Always use
  // a throwing stub, and assert the THROW in assert()-miss cases (not just that
  // the mock was called).
  let onBadRequest: jest.Mock;

  beforeEach(() => {
    onBadRequest = jest.fn((msg: string) => {
      throw new BadRequestException(msg);
    });
  });

  const makeSanitizer = (cols: ReadonlySet<string> | (() => ReadonlySet<string>) = allowedColumns) =>
    new InputSanitizer({
      allowedColumns: cols,
      onBadRequest,
    });

  describe('check()', () => {
    it('returns true for allowlist hit', () => {
      const s = makeSanitizer();
      expect(s.check('name')).toBe(true);
      expect(onBadRequest).not.toHaveBeenCalled();
    });

    it('returns false for allowlist miss', () => {
      const s = makeSanitizer();
      expect(s.check('nonExistent')).toBe(false);
      expect(onBadRequest).not.toHaveBeenCalled();
    });

    it.each(injectionInputs)('returns false for injection attempt: %s', (input) => {
      const s = makeSanitizer();
      expect(s.check(input)).toBe(false);
      expect(onBadRequest).not.toHaveBeenCalled();
    });

    it('returns true for dotted path where first segment is in allowlist', () => {
      const s = makeSanitizer();
      expect(s.check('profile.nested')).toBe(true);
    });

    it('returns true for full dotted path present in allowlist', () => {
      const cols = new Set(['users.name']);
      const s = makeSanitizer(cols);
      // First-segment split prefers base ('users') if present; full-path fallback also matches.
      expect(s.check('users.name')).toBe(true);
    });
  });

  describe('assert()', () => {
    it('does not throw and does not call onBadRequest for allowlist hit', () => {
      const s = makeSanitizer();
      expect(() => s.assert('name')).not.toThrow();
      expect(onBadRequest).not.toHaveBeenCalled();
    });

    it('throws BadRequestException with "is not allowed" message for miss', () => {
      const s = makeSanitizer();
      expect(() => s.assert('nonExistent')).toThrow(BadRequestException);
      expect(onBadRequest).toHaveBeenCalledWith('Field "nonExistent" is not allowed');
    });

    it.each(injectionInputs)('throws BadRequestException for injection attempt: %s', (input) => {
      const s = makeSanitizer();
      expect(() => s.assert(input)).toThrow(BadRequestException);
      expect(onBadRequest).toHaveBeenCalledWith(`Field "${input}" is not allowed`);
    });
  });

  describe('late-binding allowedColumns (function form)', () => {
    it('re-evaluates the allowlist on each check() call', () => {
      const mutable = new Set(['id']);
      const s = makeSanitizer(() => mutable);

      expect(s.check('id')).toBe(true);
      expect(s.check('name')).toBe(false);

      mutable.add('name');
      expect(s.check('name')).toBe(true);
    });

    it('re-evaluates the allowlist on each assert() call', () => {
      const mutable = new Set(['id']);
      const s = makeSanitizer(() => mutable);

      expect(() => s.assert('name')).toThrow(BadRequestException);
      mutable.add('name');
      expect(() => s.assert('name')).not.toThrow();
    });
  });
});
