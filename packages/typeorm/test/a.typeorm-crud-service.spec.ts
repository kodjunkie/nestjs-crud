describe('TypeOrmCrudService', () => {
  // Legacy `#checkSqlInjection` describe deleted in Plan 04-05:
  // coverage now lives in packages/core/test/input-sanitizer.spec.ts.
  //
  // The former `strictSanitization` opt-out describe was removed in the
  // follow-up v2.0 cleanup — v2 ships a pure allowlist with no opt-out.
  // See packages/core/test/input-sanitizer.spec.ts for the class-level matrix.

  it('placeholder — adapter-level behavior covered elsewhere', () => {
    expect(true).toBe(true);
  });
});
