/* eslint-disable @typescript-eslint/no-var-requires */

// Per-package Jest config for @nestjs-crud/mikro-orm.
// Runs MikroORM specs under native Jest 30 ESM via ts-jest's ESM preset.
// Required because @mikro-orm/core v7 ships pure ESM using `import.meta.url`.
// Invoke via: `yarn test:mikro-orm` (sets NODE_OPTIONS=--experimental-vm-modules).
// Root jest.config.js stays CommonJS — the other 5 packages are unaffected.

const rootConfig = require('../../jest.config.js');

// Drop root `testRegex` — we scope via `testMatch` here; Jest forbids both.
const { testRegex: _testRegex, ...rootConfigWithoutTestRegex } = rootConfig;

module.exports = {
  ...rootConfigWithoutTestRegex,
  rootDir: '../..',
  preset: 'ts-jest/presets/default-esm',
  testTimeout: 30000,
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['<rootDir>/packages/mikro-orm/test/**/*.spec.ts'],
  transformIgnorePatterns: ['/node_modules/(?!(@mikro-orm)/)'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        // Inline tsconfig override: root tsconfig sets module: commonjs which would
        // emit `exports.x = ...` and break under the ESM loader. ts-jest's tsconfig
        // option takes flat compilerOptions (not an extends/compilerOptions wrapper).
        tsconfig: {
          module: 'esnext',
          target: 'es2020',
          esModuleInterop: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          allowSyntheticDefaultImports: true,
          skipLibCheck: true,
          removeComments: false,
        },
        useESM: true,
        // Runtime module resolution is handled by Jest's moduleNameMapper
        // (inherited from root). Disabling ts-jest type-level diagnostics
        // avoids spurious TS2307s from ts-jest not seeing the root tsconfig
        // baseUrl+paths under inline-tsconfig override.
        diagnostics: false,
      },
    ],
    '^.+\\.js$': [
      'ts-jest',
      {
        tsconfig: {
          allowJs: true,
          module: 'esnext',
          target: 'es2020',
          esModuleInterop: true,
          removeComments: false,
        },
        useESM: true,
        diagnostics: false,
      },
    ],
  },
};
