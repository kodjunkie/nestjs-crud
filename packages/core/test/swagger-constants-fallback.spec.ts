import * as path from 'path';

import { INLINED_FALLBACK } from '../src/crud/swagger/swagger-constants';

/**
 * Ground-truth regression gate for the inlined `DECORATORS` fallback.
 *
 * With `@nestjs/swagger` 11.4.3+ installed, its exports map blocks the
 * `./dist/constants` deep require, so `INLINED_FALLBACK` is the ACTIVE path
 * both at runtime and under jest. A typo'd key would be invisible to
 * `swagger-description.spec.ts` (writer and reader derive their keys from the
 * same object), so the fallback must be compared against the REAL upstream
 * module. The exports map is bypassed deliberately: `require.resolve` on
 * `package.json` (always exported) anchors the package root, and absolute-path
 * requires are not subject to exports maps.
 *
 * If this spec fails after a `@nestjs/swagger` upgrade, upstream renamed or
 * added a `DECORATORS` key — update `INLINED_FALLBACK` to match.
 */
describe('swagger-constants inlined fallback vs installed @nestjs/swagger', () => {
  const swaggerRoot = path.dirname(require.resolve('@nestjs/swagger/package.json'));
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const real = require(path.join(swaggerRoot, 'dist', 'constants.js'));

  it('DECORATORS_PREFIX matches the installed module', () => {
    expect(INLINED_FALLBACK.DECORATORS_PREFIX).toBe(real.DECORATORS_PREFIX);
  });

  it('DECORATORS matches the installed module key-for-key (catches typos and upstream drift)', () => {
    expect(INLINED_FALLBACK.DECORATORS).toEqual(real.DECORATORS);
  });
});
