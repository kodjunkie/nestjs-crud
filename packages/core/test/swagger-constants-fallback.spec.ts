import * as path from 'path';

import { INLINED_FALLBACK, swaggerConst, SwaggerConstants } from '../src/crud/swagger/swagger-constants';

/**
 * Ground-truth regression gate for the inlined `DECORATORS` fallback — made
 * resolution-path-aware so it holds on every installed `@nestjs/swagger` line
 * (7, 8, 11, 12), not just whichever line happened to be installed when the
 * assertions were written.
 *
 * `resolveSwaggerConst()` (production) first tries a *bare-specifier* deep
 * require (`require('@nestjs/swagger/dist/constants')`). On swagger 7 and 8
 * (no package `exports` map) that specifier resolves through plain
 * `node_modules` lookup and wins outright — `swaggerConst` IS the installed
 * module, by object reference. On swagger 11+ (an `exports` map that only
 * allows `.`, `./plugin`, and `./package.json`) that same specifier throws
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`, `safeRequire` swallows it, and production
 * falls back to `INLINED_FALLBACK`.
 *
 * This spec's own `real` binding uses an *absolute-path* require, which is
 * not subject to a package's `exports` map on any Node version — so `real` is
 * always the true installed module regardless of which path production took.
 * Which path won is then read directly off `swaggerConst === real` (both
 * requires resolve to the identical cached module when the specifier form
 * succeeds), rather than hardcoded by version — so the assertions below hold
 * whichever swagger major happens to be installed.
 */
describe('swagger-constants inlined fallback vs installed @nestjs/swagger', () => {
  const swaggerRoot = path.dirname(require.resolve('@nestjs/swagger/package.json'));
  const real: SwaggerConstants = require(path.join(swaggerRoot, 'dist', 'constants.js'));

  // Computed, not asserted by version: whether production's own bare-specifier
  // deep require won (identical object to the absolute-path require above) or
  // was blocked by an exports map and fell back to INLINED_FALLBACK.
  const deepRequireWon = swaggerConst === real;

  it('DECORATORS_PREFIX matches the installed module', () => {
    expect(INLINED_FALLBACK.DECORATORS_PREFIX).toBe(real.DECORATORS_PREFIX);
  });

  it('every DECORATORS key the installed module defines exists in the inlined fallback with the same value (catches a typo or an upstream addition on every swagger line)', () => {
    for (const [key, value] of Object.entries(real.DECORATORS)) {
      expect(INLINED_FALLBACK.DECORATORS).toHaveProperty(key, value);
    }
  });

  if (deepRequireWon) {
    it('the bare-specifier deep require won (no exports map blocking it) — production reads the installed module directly, never the inlined fallback', () => {
      expect(swaggerConst).toBe(real);
    });
  } else {
    it('an exports map blocked the deep require — production falls back to the inlined literal, which must equal the installed module key-for-key (today\'s drift gate)', () => {
      expect(swaggerConst).toBe(INLINED_FALLBACK);
      expect(INLINED_FALLBACK.DECORATORS).toEqual(real.DECORATORS);
    });
  }
});
