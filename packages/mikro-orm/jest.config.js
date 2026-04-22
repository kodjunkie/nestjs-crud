/* eslint-disable @typescript-eslint/no-var-requires */

// Per-package Jest config for @nestjs-crud/mikro-orm.
// Runs MikroORM specs under native Jest 30 ESM via ts-jest's ESM preset.
// Required because @mikro-orm/core v7 ships pure ESM using `import.meta.url`.
// Invoke via: `yarn test:mikro-orm` (sets NODE_OPTIONS=--experimental-vm-modules).
// Root jest.config.js stays CommonJS — the other 5 packages are unaffected.

const rootConfig = require('../../jest.config.js');

module.exports = {
  ...rootConfig,
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['<rootDir>/packages/mikro-orm/test/**/*.spec.ts'],
  transformIgnorePatterns: ['/node_modules/(?!(@mikro-orm)/)'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.jest.json',
        useESM: true,
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
