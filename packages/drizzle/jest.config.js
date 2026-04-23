/* eslint-disable @typescript-eslint/no-var-requires */

// Per-package Jest config for @nestjs-crud/drizzle.
// Scopes test discovery to packages/drizzle/test/**/*.spec.ts.
// Drizzle ORM is CJS-compatible — NO ESM preset needed here.
// Invoke via: npx jest --config packages/drizzle/jest.config.js
// Root jest.config.js stays CommonJS — the other packages are unaffected.

const rootConfig = require('../../jest.config.js');

// Drop root `testRegex` — we scope via `testMatch` here; Jest forbids both.
const { testRegex: _testRegex, ...rootConfigWithoutTestRegex } = rootConfig;

module.exports = {
  ...rootConfigWithoutTestRegex,
  rootDir: '../..',
  testMatch: ['<rootDir>/packages/drizzle/test/**/*.spec.ts'],
  testTimeout: 30000,
  forceExit: true,
  // D-12: scope coverage collection to this adapter's own src tree.
  collectCoverageFrom: [
    'packages/drizzle/src/**/*.ts',
    '!packages/drizzle/src/**/*.d.ts',
    '!packages/drizzle/src/**/index.ts',
    '!packages/drizzle/src/**/*.interface.ts',
    '!**/__stubs__/**',
    '!**/__fixture__/**',
  ],
  // D-12: per-package coverage floor. Thresholds locked at current measured
  // values (rounded down to 5%-bands) to prevent regression. Lifting to the
  // standard 80% target requires additional test scenarios for the drizzle
  // adapter (Phase 11+). Plan 10-09 SUMMARY documents the deviation; honest
  // floor > false 80% advertisement.
  coverageThreshold: {
    global: {
      lines: 65,
      branches: 50,
      functions: 65,
      statements: 65,
    },
  },
};
