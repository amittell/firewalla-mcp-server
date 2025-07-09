/**
 * Jest setup file with flexible configuration support
 */

import { getTestConfig, shouldSkipTest, isMockingEnabled } from '../config/test-config.js';

// Set up test environment variables
process.env.FIREWALLA_MSP_TOKEN = process.env.FIREWALLA_MSP_TOKEN || 'test-token';
process.env.FIREWALLA_MSP_ID = process.env.FIREWALLA_MSP_ID || 'test.firewalla.net';
process.env.FIREWALLA_BOX_ID = process.env.FIREWALLA_BOX_ID || 'test-box-id';

// Initialize test configuration
const testConfig = getTestConfig();

// Set up global test timeout based on configuration
jest.setTimeout(testConfig.timeout.unit);

// Configure console logging based on test environment
if (testConfig.logging.level === 'silent') {
  // Suppress console output in silent mode
  global.console = {
    ...console,
    log: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
} else if (!testConfig.logging.captureConsole) {
  // Restore original console methods if capture is disabled
  global.console = require('console');
}

// Set up performance monitoring if enabled
if (testConfig.performance.enableProfiling) {
  let testStartTime: number;
  
  beforeEach(() => {
    testStartTime = Date.now();
  });
  
  afterEach(() => {
    const testDuration = Date.now() - testStartTime;
    if (testDuration > testConfig.performance.slowTestThreshold) {
      console.warn(`Slow test detected: ${expect.getState().currentTestName} took ${testDuration}ms`);
    }
  });
}

// Set up memory leak detection if enabled
if (testConfig.performance.memoryLeakDetection) {
  let initialMemoryUsage: NodeJS.MemoryUsage;
  
  beforeAll(() => {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    initialMemoryUsage = process.memoryUsage();
  });
  
  afterAll(() => {
    if (global.gc) {
      global.gc();
    }
    const finalMemoryUsage = process.memoryUsage();
    const memoryIncrease = finalMemoryUsage.heapUsed - initialMemoryUsage.heapUsed;
    
    // Warn if memory usage increased significantly (more than 50MB)
    if (memoryIncrease > 50 * 1024 * 1024) {
      console.warn(`Potential memory leak detected: ${memoryIncrease / 1024 / 1024}MB increase`);
    }
  });
}

// Set up network mocking if enabled
if (isMockingEnabled('network')) {
  // Mock HTTP requests - handled in individual test files if needed
  // Note: Mocking should be done at the test level, not globally
}

// Set up time mocking if enabled
if (isMockingEnabled('time')) {
  jest.useFakeTimers();
  
  afterEach(() => {
    if (jest.isMockFunction(setTimeout)) {
      jest.runOnlyPendingTimers();
    }
    jest.useRealTimers();
  });
}

// Set up filesystem mocking if enabled
if (isMockingEnabled('filesystem')) {
  jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    mkdir: jest.fn(),
  }));
}

// Global test utilities
declare global {
  namespace jest {
    interface Matchers<R> {
      toCompleteWithinTimeout(timeout?: number): R;
      toHaveValidCorrelationScore(): R;
      toBeWithinPerformanceThreshold(threshold?: number): R;
    }
  }
}

// Custom Jest matchers
expect.extend({
  toCompleteWithinTimeout(received: Promise<any>, timeout?: number) {
    const actualTimeout = timeout || testConfig.timeout.unit;
    const start = Date.now();
    
    return received
      .then(() => {
        const duration = Date.now() - start;
        if (duration > actualTimeout) {
          return {
            message: () => `Expected operation to complete within ${actualTimeout}ms, but took ${duration}ms`,
            pass: false,
          };
        }
        return {
          message: () => `Operation completed within ${actualTimeout}ms (${duration}ms)`,
          pass: true,
        };
      })
      .catch((error) => {
        return {
          message: () => `Operation failed: ${error.message}`,
          pass: false,
        };
      });
  },
  
  toHaveValidCorrelationScore(received: any) {
    const score = received.correlationScore || received.score;
    
    if (typeof score !== 'number') {
      return {
        message: () => `Expected correlation score to be a number, received ${typeof score}`,
        pass: false,
      };
    }
    
    if (score < 0 || score > 1) {
      return {
        message: () => `Expected correlation score to be between 0 and 1, received ${score}`,
        pass: false,
      };
    }
    
    return {
      message: () => `Correlation score ${score} is valid`,
      pass: true,
    };
  },
  
  toBeWithinPerformanceThreshold(received: number, threshold?: number) {
    const actualThreshold = threshold || testConfig.performance.slowTestThreshold;
    
    if (received > actualThreshold) {
      return {
        message: () => `Expected operation to complete within ${actualThreshold}ms, but took ${received}ms`,
        pass: false,
      };
    }
    
    return {
      message: () => `Operation completed within performance threshold (${received}ms <= ${actualThreshold}ms)`,
      pass: true,
    };
  },
});

// Test skipping utilities
export function skipIfSlow(description: string, testFn: () => void) {
  if (shouldSkipTest('slow')) {
    it.skip(`${description} (skipped: slow test in CI)`, testFn);
  } else {
    it(description, testFn);
  }
}

export function skipIfFlaky(description: string, testFn: () => void) {
  if (shouldSkipTest('flaky')) {
    it.skip(`${description} (skipped: flaky test in CI)`, testFn);
  } else {
    it(description, testFn);
  }
}

export function skipIfNetwork(description: string, testFn: () => void) {
  if (shouldSkipTest('network')) {
    it.skip(`${description} (skipped: network mocking enabled)`, testFn);
  } else {
    it(description, testFn);
  }
}

export function describeIntegration(description: string, suiteFn: () => void) {
  if (shouldSkipTest('integration')) {
    describe.skip(`${description} (skipped: integration tests disabled)`, suiteFn);
  } else {
    describe(description, suiteFn);
  }
}

// Retry wrapper for flaky tests
export function withRetries<T>(testFn: () => Promise<T>, category: 'flaky' | 'network' | 'default' = 'default'): () => Promise<T> {
  return async () => {
    const maxRetries = testConfig.retries[category];
    let lastError: Error;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await testFn();
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          console.warn(`Test attempt ${attempt + 1} failed, retrying... (${error.message})`);
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
    
    throw lastError!;
  };
}

// Performance measurement utilities
export async function measurePerformance<T>(operation: () => Promise<T>): Promise<{ result: T; duration: number }> {
  const start = Date.now();
  
  try {
    const result = await operation();
    const duration = Date.now() - start;
    
    return { result, duration };
  } catch (error) {
    const duration = Date.now() - start;
    throw error;
  }
}

// Environment info logging
if (testConfig.logging.enableVerbose) {
  console.log(`Test Environment: ${testConfig.name}`);
  console.log(`Max Workers: ${testConfig.concurrency.maxWorkers}`);
  console.log(`Coverage Enabled: ${testConfig.coverage.enabled}`);
  console.log(`Network Mocking: ${testConfig.mocking.enableNetworkMocks}`);
}