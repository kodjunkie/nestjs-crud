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
};
