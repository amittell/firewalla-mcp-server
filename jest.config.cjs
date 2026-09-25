module.exports = {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: 'tsconfig.test.json',
      // import.meta is a syntax error under CommonJS; lets tests import
      // src/server.ts
      astTransformers: {
        before: ['<rootDir>/tests/setup/import-meta-url.cjs']
      }
    }]
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/coverage/'
  ],
  // Include all source files for coverage, even if they are not
  // directly required by the test suites.  This boosts the overall
  // coverage metric and helps spot untested areas.
  collectCoverageFrom: ['src/**/*.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/jest-setup.ts'],
  testTimeout: 10000,
  // TODO: Investigate and fix test cleanup issues. The MCP server creates
  // persistent connections and event listeners that prevent Jest from exiting
  // cleanly. This should be addressed by properly closing all connections
  // and clearing all timers in afterAll/afterEach hooks.
  forceExit: true
};