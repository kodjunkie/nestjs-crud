import { CrudConfigService } from '@nestjs-crud/core';

describe('TypeOrmCrudService', () => {
  // Legacy `#checkSqlInjection` describe deleted in Plan 04-05:
  // coverage now lives in packages/core/test/input-sanitizer.spec.ts.
  //
  // Opt-out wire (global-only per Plan 04-03 A2 fallback): exercise the
  // CrudConfigService.strictSanitization flag that `resolveStrictSanitization`
  // reads on every adapter ctor. This is the sole runtime surface for the
  // `strictSanitization: false` opt-out in v2.0.

  describe('InputSanitizer integration (strict opt-out via CrudConfigService)', () => {
    afterEach(() => {
      // Reset to default so other specs don't see the mutated global.
      CrudConfigService.load({ strictSanitization: true });
    });

    it('defaults strictSanitization to true (strict allowlist enforcement)', () => {
      // Plan 04-03 wires the default in CrudConfigService.config.
      expect(CrudConfigService.config.strictSanitization).toBe(true);
    });

    it('honors strictSanitization: false opt-out via CrudConfigService.load()', () => {
      CrudConfigService.load({ strictSanitization: false });
      expect(CrudConfigService.config.strictSanitization).toBe(false);
    });

    it('honors strictSanitization: true re-load after opt-out', () => {
      CrudConfigService.load({ strictSanitization: false });
      CrudConfigService.load({ strictSanitization: true });
      expect(CrudConfigService.config.strictSanitization).toBe(true);
    });
  });
});
