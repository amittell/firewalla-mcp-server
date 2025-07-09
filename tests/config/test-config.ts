/**
 * Flexible test configuration system for consistent testing across environments
 */

export interface TestEnvironmentConfig {
  name: string;
  timeout: {
    unit: number;
    integration: number;
    e2e: number;
  };
  retries: {
    flaky: number;
    network: number;
    default: number;
  };
  concurrency: {
    maxWorkers: number;
    enableParallel: boolean;
  };
  coverage: {
    enabled: boolean;
    threshold: {
      statements: number;
      branches: number;
      functions: number;
      lines: number;
    };
  };
  mocking: {
    enableNetworkMocks: boolean;
    enableTimeMocks: boolean;
    enableFilesystemMocks: boolean;
  };
  logging: {
    level: 'silent' | 'error' | 'warn' | 'info' | 'debug';
    enableVerbose: boolean;
    captureConsole: boolean;
  };
  performance: {
    enableProfiling: boolean;
    memoryLeakDetection: boolean;
    slowTestThreshold: number;
  };
}

/**
 * Environment-specific test configurations
 */
export const TEST_ENVIRONMENTS: Record<string, TestEnvironmentConfig> = {
  ci: {
    name: 'Continuous Integration',
    timeout: {
      unit: 10000,
      integration: 30000,
      e2e: 60000,
    },
    retries: {
      flaky: 3,
      network: 2,
      default: 1,
    },
    concurrency: {
      maxWorkers: parseInt(process.env.CI_MAX_WORKERS || '2', 10),
      enableParallel: true,
    },
    coverage: {
      enabled: true,
      threshold: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    mocking: {
      enableNetworkMocks: true,
      enableTimeMocks: false, // Disabled in CI to prevent hanging tests
      enableFilesystemMocks: true,
    },
    logging: {
      level: 'error',
      enableVerbose: false,
      captureConsole: true,
    },
    performance: {
      enableProfiling: false,
      memoryLeakDetection: true,
      slowTestThreshold: 5000,
    },
  },
  development: {
    name: 'Development',
    timeout: {
      unit: 5000,
      integration: 15000,
      e2e: 30000,
    },
    retries: {
      flaky: 1,
      network: 1,
      default: 0,
    },
    concurrency: {
      maxWorkers: Math.max(1, Math.floor(require('os').cpus().length / 2)),
      enableParallel: true,
    },
    coverage: {
      enabled: true,
      threshold: {
        statements: 70,
        branches: 65,
        functions: 70,
        lines: 70,
      },
    },
    mocking: {
      enableNetworkMocks: false,
      enableTimeMocks: false,
      enableFilesystemMocks: false,
    },
    logging: {
      level: 'info',
      enableVerbose: true,
      captureConsole: true,
    },
    performance: {
      enableProfiling: true,
      memoryLeakDetection: false,
      slowTestThreshold: 2000,
    },
  },
  debug: {
    name: 'Debug',
    timeout: {
      unit: 30000,
      integration: 60000,
      e2e: 120000,
    },
    retries: {
      flaky: 0,
      network: 0,
      default: 0,
    },
    concurrency: {
      maxWorkers: 1,
      enableParallel: false,
    },
    coverage: {
      enabled: false,
      threshold: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
    },
    mocking: {
      enableNetworkMocks: false,
      enableTimeMocks: false,
      enableFilesystemMocks: false,
    },
    logging: {
      level: 'debug',
      enableVerbose: true,
      captureConsole: true,
    },
    performance: {
      enableProfiling: true,
      memoryLeakDetection: false,
      slowTestThreshold: 1000,
    },
  },
  performance: {
    name: 'Performance Testing',
    timeout: {
      unit: 60000,
      integration: 120000,
      e2e: 300000,
    },
    retries: {
      flaky: 0,
      network: 0,
      default: 0,
    },
    concurrency: {
      maxWorkers: 1,
      enableParallel: false,
    },
    coverage: {
      enabled: false,
      threshold: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
    },
    mocking: {
      enableNetworkMocks: false,
      enableTimeMocks: false,
      enableFilesystemMocks: false,
    },
    logging: {
      level: 'silent',
      enableVerbose: false,
      captureConsole: false,
    },
    performance: {
      enableProfiling: true,
      memoryLeakDetection: true,
      slowTestThreshold: 500,
    },
  },
  local: {
    name: 'Local Development',
    timeout: {
      unit: 5000,
      integration: 10000,
      e2e: 20000,
    },
    retries: {
      flaky: 0,
      network: 0,
      default: 0,
    },
    concurrency: {
      maxWorkers: require('os').cpus().length,
      enableParallel: true,
    },
    coverage: {
      enabled: false,
      threshold: {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      },
    },
    mocking: {
      enableNetworkMocks: true,
      enableTimeMocks: false,
      enableFilesystemMocks: false,
    },
    logging: {
      level: 'info',
      enableVerbose: true,
      captureConsole: true,
    },
    performance: {
      enableProfiling: false,
      memoryLeakDetection: false,
      slowTestThreshold: 3000,
    },
  },
};

/**
 * Current test configuration
 */
let currentTestConfig: TestEnvironmentConfig = TEST_ENVIRONMENTS.local;

/**
 * Get current test environment from environment variables
 */
export function detectTestEnvironment(): string {
  if (process.env.CI) return 'ci';
  if (process.env.NODE_ENV === 'test') return 'development';
  if (process.env.DEBUG) return 'debug';
  if (process.env.TEST_ENV) return process.env.TEST_ENV;
  return 'local';
}

/**
 * Initialize test configuration based on environment
 */
export function initializeTestConfig(environment?: string): TestEnvironmentConfig {
  const env = environment || detectTestEnvironment();
  
  if (TEST_ENVIRONMENTS[env]) {
    currentTestConfig = { ...TEST_ENVIRONMENTS[env] };
  } else {
    console.warn(`Unknown test environment '${env}', falling back to 'local'`);
    currentTestConfig = { ...TEST_ENVIRONMENTS.local };
  }
  
  // Apply environment variable overrides
  applyEnvironmentOverrides();
  
  return currentTestConfig;
}

/**
 * Apply environment variable overrides to test configuration
 */
function applyEnvironmentOverrides(): void {
  // Timeout overrides
  if (process.env.TEST_TIMEOUT_UNIT) {
    currentTestConfig.timeout.unit = parseInt(process.env.TEST_TIMEOUT_UNIT, 10);
  }
  if (process.env.TEST_TIMEOUT_INTEGRATION) {
    currentTestConfig.timeout.integration = parseInt(process.env.TEST_TIMEOUT_INTEGRATION, 10);
  }
  if (process.env.TEST_TIMEOUT_E2E) {
    currentTestConfig.timeout.e2e = parseInt(process.env.TEST_TIMEOUT_E2E, 10);
  }
  
  // Retry overrides
  if (process.env.TEST_RETRIES) {
    const retries = parseInt(process.env.TEST_RETRIES, 10);
    currentTestConfig.retries.default = retries;
    currentTestConfig.retries.flaky = retries;
    currentTestConfig.retries.network = retries;
  }
  
  // Concurrency overrides
  if (process.env.TEST_MAX_WORKERS) {
    currentTestConfig.concurrency.maxWorkers = parseInt(process.env.TEST_MAX_WORKERS, 10);
  }
  if (process.env.TEST_PARALLEL === 'false') {
    currentTestConfig.concurrency.enableParallel = false;
  }
  
  // Coverage overrides
  if (process.env.TEST_COVERAGE === 'false') {
    currentTestConfig.coverage.enabled = false;
  }
  if (process.env.TEST_COVERAGE_THRESHOLD) {
    const threshold = parseInt(process.env.TEST_COVERAGE_THRESHOLD, 10);
    currentTestConfig.coverage.threshold = {
      statements: threshold,
      branches: threshold,
      functions: threshold,
      lines: threshold,
    };
  }
  
  // Logging overrides
  if (process.env.TEST_LOG_LEVEL) {
    currentTestConfig.logging.level = process.env.TEST_LOG_LEVEL as any;
  }
  if (process.env.TEST_VERBOSE === 'true') {
    currentTestConfig.logging.enableVerbose = true;
  }
  
  // Performance overrides
  if (process.env.TEST_ENABLE_PROFILING === 'true') {
    currentTestConfig.performance.enableProfiling = true;
  }
  if (process.env.TEST_SLOW_THRESHOLD) {
    currentTestConfig.performance.slowTestThreshold = parseInt(process.env.TEST_SLOW_THRESHOLD, 10);
  }
}

/**
 * Get current test configuration
 */
export function getTestConfig(): TestEnvironmentConfig {
  return currentTestConfig;
}

/**
 * Update test configuration at runtime
 */
export function updateTestConfig(updates: Partial<TestEnvironmentConfig>): void {
  currentTestConfig = {
    ...currentTestConfig,
    ...updates,
    timeout: {
      ...currentTestConfig.timeout,
      ...(updates.timeout || {})
    },
    retries: {
      ...currentTestConfig.retries,
      ...(updates.retries || {})
    },
    concurrency: {
      ...currentTestConfig.concurrency,
      ...(updates.concurrency || {})
    },
    coverage: {
      ...currentTestConfig.coverage,
      ...(updates.coverage || {}),
      threshold: {
        ...currentTestConfig.coverage.threshold,
        ...(updates.coverage?.threshold || {})
      }
    },
    mocking: {
      ...currentTestConfig.mocking,
      ...(updates.mocking || {})
    },
    logging: {
      ...currentTestConfig.logging,
      ...(updates.logging || {})
    },
    performance: {
      ...currentTestConfig.performance,
      ...(updates.performance || {})
    }
  };
}

/**
 * Get Jest configuration based on current test config
 */
export function getJestConfig(): any {
  const config = getTestConfig();
  
  return {
    testTimeout: config.timeout.unit,
    maxWorkers: config.concurrency.maxWorkers,
    verbose: config.logging.enableVerbose,
    silent: config.logging.level === 'silent',
    collectCoverage: config.coverage.enabled,
    coverageThreshold: config.coverage.enabled ? {
      global: config.coverage.threshold
    } : undefined,
    setupFilesAfterEnv: ['<rootDir>/tests/setup/jest-setup.ts'],
    testEnvironment: 'node',
    preset: 'ts-jest',
    extensionsToTreatAsEsm: ['.ts'],
    moduleNameMapping: {
      '^(\\.{1,2}/.*)\\.js$': '$1',
    },
    transform: {
      '^.+\\.ts$': ['ts-jest', {
        useESM: true,
      }],
    },
    testMatch: [
      '<rootDir>/tests/**/*.test.ts',
      '<rootDir>/tests/**/*.spec.ts'
    ],
    collectCoverageFrom: [
      'src/**/*.ts',
      '!src/**/*.d.ts',
      '!src/**/*.test.ts',
      '!src/**/*.spec.ts'
    ],
    coverageReporters: ['text', 'html', 'lcov'],
    testResultsProcessor: config.performance.enableProfiling ? 'jest-performance-reporter' : undefined
  };
}

/**
 * Get timeout for specific test type
 */
export function getTimeoutForTestType(type: 'unit' | 'integration' | 'e2e'): number {
  const config = getTestConfig();
  return config.timeout[type];
}

/**
 * Get retry count for specific test category
 */
export function getRetryCount(category: 'flaky' | 'network' | 'default'): number {
  const config = getTestConfig();
  return config.retries[category];
}

/**
 * Check if mocking is enabled for specific type
 */
export function isMockingEnabled(type: 'network' | 'time' | 'filesystem'): boolean {
  const config = getTestConfig();
  switch (type) {
    case 'network': return config.mocking.enableNetworkMocks;
    case 'time': return config.mocking.enableTimeMocks;
    case 'filesystem': return config.mocking.enableFilesystemMocks;
    default: return false;
  }
}

/**
 * Check if test should be skipped based on environment
 */
export function shouldSkipTest(testType: 'slow' | 'flaky' | 'network' | 'integration'): boolean {
  const config = getTestConfig();
  const env = detectTestEnvironment();
  
  switch (testType) {
    case 'slow':
      return env === 'ci' && !config.performance.enableProfiling;
    case 'flaky':
      return env === 'ci' && config.retries.flaky === 0;
    case 'network':
      return config.mocking.enableNetworkMocks;
    case 'integration':
      return env === 'local' && process.env.SKIP_INTEGRATION === 'true';
    default:
      return false;
  }
}

// Initialize configuration when module is loaded
initializeTestConfig();