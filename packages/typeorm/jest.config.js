/* eslint-disable @typescript-eslint/no-var-requires */

// Per-package Jest config for @nestjs-crud/typeorm.
// Scopes test discovery to packages/typeorm/test/**/*.spec.ts.
// TypeORM is CJS-compatible — NO ESM preset needed here.
// Invoke via: npx jest --config packages/typeorm/jest.config.js
// Root jest.config.js stays CommonJS — the other packages are unaffected.

const rootConfig = require('../../jest.config.js');

// Drop root `testRegex` — we scope via `testMatch` here; Jest forbids both.
const { testRegex: _testRegex, ...rootConfigWithoutTestRegex } = rootConfig;

module.exports = {
  ...rootConfigWithoutTestRegex,
  rootDir: '../..',
  testMatch: ['<rootDir>/packages/typeorm/test/**/*.spec.ts'],
  testTimeout: 30000,
  forceExit: true,
  // D-12: scope coverage collection to this adapter's own src tree. Cross-package
  // files (drizzle/mikro-orm/prisma) inflate the "uncovered" count when this
  // adapter's test run cannot exercise them.
  collectCoverageFrom: [
    'packages/typeorm/src/**/*.ts',
    '!packages/typeorm/src/**/*.d.ts',
    '!packages/typeorm/src/**/index.ts',
    '!packages/typeorm/src/**/*.interface.ts',
    '!**/__stubs__/**',
    '!**/__fixture__/**',
  ],
  // D-12: 80% per-metric floor enforced via Jest's native gate.
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 80,
      functions: 80,
      statements: 80,
    },
  },
};
