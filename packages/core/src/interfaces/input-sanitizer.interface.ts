/**
 * Strategy interface for validating field names against an allowlist derived
 * from entity column metadata (plus optional joined-relation columns).
 *
 * Interface ships in Phase 4 (ARCH-03); the reference implementation is the
 * `InputSanitizer` concrete class in the same package. Adapters instantiate
 * it directly (not via DI) in their constructor.
 *
 * @since 2.0.0
 */
export interface InputSanitizer {
  /**
   * Soft validation: returns `true` when the field is in the allowlist.
   * Does NOT throw. Callers use this when an invalid field should be
   * skipped rather than surface a 400.
   */
  check(field: string): boolean;

  /**
   * Hard validation: throws `BadRequestException` when the field is not
   * in the allowlist. Route handlers call this — a thrown exception
   * becomes a 400 to the client.
   *
   * **Contract:** `assert` signals failure by invoking the `onBadRequest`
   * callback supplied at construction. That callback MUST throw (e.g., by
   * calling `throwBadRequestException`). If it does not, `assert` returns
   * `void` and the invalid field passes through silently — a security bug.
   * Test harnesses MUST use a throwing stub, e.g.
   * `onBadRequest: jest.fn((m) => { throw new BadRequestException(m); })`,
   * never a no-op `jest.fn()`.
   */
  assert(field: string): void;
}
