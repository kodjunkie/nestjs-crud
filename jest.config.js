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
  testRegex: '\\.spec.ts$',
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
  // D-12: scope root coverage to core + request + util (the packages whose tests
  // run under the root config). Adapter packages (typeorm/drizzle/mikro-orm/prisma)
  // have their own jest configs + test:coverage paths; collecting their src here
  // would inflate "uncovered" counts since the root testRegex matches their specs
  // but those specs need a live DB and adapter-specific setup.
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
  // D-12: coverage floor for core+request+util. Per-package configs in
  // packages/{typeorm,drizzle,mikro-orm,prisma}/jest.config.js enforce their own
  // adapter-specific floors (some <80% with documented Phase 11+ uplift target).
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 80,
      functions: 80,
      statements: 80,
    },
  },
};
