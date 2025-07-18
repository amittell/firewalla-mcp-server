/**
 * Jest configuration for regression tests
 * Optimized for comprehensive regression testing with proper isolation
 */

export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  
  // Test file patterns - focused on regression tests
  testMatch: [
    '**/tests/regression/**/*.test.ts'
  ],
  
  // Module resolution for ESM
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  
  // Transform configuration
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
      tsconfig: {
        module: 'ES2022',
        target: 'ES2022',
        moduleResolution: 'node',
        allowSyntheticDefaultImports: true,
        esModuleInterop: true
      }
    }]
  },
  
  // Coverage configuration - focused on regression test quality
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/types.ts',
    '!src/server.ts' // Exclude server entry point
  ],
  
  // Test execution configuration
  testTimeout: 30000, // 30 seconds for comprehensive tests
  maxWorkers: '50%', // Use half of available CPU cores
  
  // Reporter configuration for regression testing
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: './coverage/regression',
      outputName: 'regression-results.xml',
      suiteNameTemplate: 'Regression Tests - {displayName}',
      classNameTemplate: '{classname}',
      titleTemplate: '{title}'
    }]
  ],
  
  // Setup files for regression tests
  setupFilesAfterEnv: [
    '<rootDir>/tests/regression/setup.ts'
  ],
  
  // Global configuration for regression testing
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  
  // Test environment variables
  testEnvironmentOptions: {
    NODE_ENV: 'test',
    REGRESSION_TEST: 'true'
  },
  
  // Verbose output for detailed regression test reporting
  verbose: true,
  
  // Fail fast on first test failure for quick feedback
  bail: 1,
  
  // Clear mocks between tests for isolation
  clearMocks: true,
  restoreMocks: true,
  
  // Error handling
  errorOnDeprecated: true,
  
  // Test result processor for regression analysis
  testResultsProcessor: '<rootDir>/tests/regression/results-processor.js'
};