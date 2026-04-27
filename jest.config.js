/* eslint-disable @typescript-eslint/no-var-requires */

const tsconfig = require('tsconfig-extends');
const { pathsToModuleNameMapper } = require('ts-jest');
const compilerOptions = tsconfig.load_file_sync('./tsconfig.jest.json', __dirname);

module.exports = {
  maxWorkers: 1,
  testEnvironment: 'node',
  setupFilesAfterEnv: ['jest-extended/all'],
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths, {
    prefix: '<rootDir>/packages/',
  }),
  moduleFileExtensions: ['ts', 'js'],
  // Root jest is scoped to core/request/util specs only. Adapter packages
  // (typeorm/drizzle/mikro-orm/prisma) have their own jest configs invoked
  // via the per-adapter `yarn test:<adapter>:<db>` scripts, which set the
  // dialect env vars and (for mikro-orm) the `--experimental-vm-modules`
  // flag. Sweeping adapter specs from root would re-run them without their
  // setup and break MikroORM's ESM imports.
  testMatch: [
    '<rootDir>/packages/core/test/**/*.spec.ts',
    '<rootDir>/packages/request/test/**/*.spec.ts',
    '<rootDir>/packages/util/test/**/*.spec.ts',
  ],
  rootDir: '.',
  transformIgnorePatterns: ['/node_modules/(?!(@mikro-orm)/)'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.jest.json',
      },
    ],
    '^.+\\.js$': [
      'ts-jest',
      {
        tsconfig: {
          allowJs: true,
          module: 'commonjs',
          target: 'es2020',
          esModuleInterop: true,
          removeComments: false,
        },
        diagnostics: false,
      },
    ],
  },
  coverageReporters: ['json', 'lcov', 'text-summary'],
  coverageDirectory: 'coverage',
  // Scope root coverage to core + request + util (the packages whose tests
  // run under the root config per the testMatch above). Adapter packages
  // (typeorm/drizzle/mikro-orm/prisma) have their own jest configs +
  // test:coverage paths; collecting their src here would inflate "uncovered"
  // counts since they're never exercised under the root config.
  collectCoverageFrom: [
    'packages/core/src/**/*.ts',
    'packages/request/src/**/*.ts',
    'packages/util/src/**/*.ts',
    '!packages/**/*.d.ts',
    '!packages/**/index.ts',
    '!packages/**/*.interface.ts',
    '!**/node_modules/**',
    '!**/__stubs__/**',
    '!**/__fixture__/**',
    '!integration/*',
  ],
  // Coverage floor for core+request+util. Per-package configs in
  // packages/{typeorm,drizzle,mikro-orm,prisma}/jest.config.js enforce their own
  // adapter-specific floors (some <80% with a documented uplift target).
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 80,
      functions: 80,
      statements: 80,
    },
  },
};
