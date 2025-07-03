/**
 * API Call Performance Monitor for Test Optimization
 * 
 * Module-based API for tracking API calls, execution times, and performance metrics.
 * Provides comprehensive monitoring to measure test optimization effectiveness.
 * 
 * Key Functions:
 * - startMonitoring() / stopMonitoring() - Control monitoring lifecycle
 * - recordApiCall() - Track individual API call performance  
 * - calculateMetrics() - Generate performance analytics
 * - generateReport() - Create detailed performance reports
 * 
 * @example
 * ```typescript
 * import { startMonitoring, stopMonitoring, recordApiCall } from './performance-monitor.js';
 * 
 * startMonitoring();
 * // ... run tests ...
 * const metrics = stopMonitoring();
 * ```
 */

// Performance configuration constants
const SLOW_CALL_THRESHOLD_MS = 1000;

export interface PerformanceConfig {
  slowCallThreshold: number;
  insights: {
    highApiCallCount: number;
    slowAverageTime: number;
    duplicateCallThreshold: number;
  };
}

const DEFAULT_CONFIG: PerformanceConfig = {
  slowCallThreshold: SLOW_CALL_THRESHOLD_MS,
  insights: {
    highApiCallCount: 20,
    slowAverageTime: 100,
    duplicateCallThreshold: 3
  }
};

let config = DEFAULT_CONFIG;

export function setPerformanceConfig(newConfig: Partial<PerformanceConfig>): void {
  config = { ...config, ...newConfig };
}

export interface ApiCallMetrics {
  endpoint: string;
  method: string;
  duration: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

export interface TestPerformanceMetrics {
  totalApiCalls: number;
  totalExecutionTime: number;
  averageCallTime: number;
  slowestCall: ApiCallMetrics | null;
  fastestCall: ApiCallMetrics | null;
  errorCount: number;
  uniqueEndpoints: string[];
  callsByEndpoint: Record<string, number>;
}

export interface PerformanceThresholds {
  maxApiCalls: number;
  maxTestDuration: number;
  maxAvgCallTime: number;
  maxSlowCalls: number;
}

/**
 * Module-scoped variables for performance monitoring
 */
let calls: ApiCallMetrics[] = [];
let testStartTime = 0;
let isMonitoring = false;

/**
 * Start monitoring API calls
 */
export function startMonitoring(): void {
  isMonitoring = true;
  testStartTime = Date.now();
  calls = [];
  console.log('📊 API Performance monitoring started');
}

/**
 * Stop monitoring and return results
 */
export function stopMonitoring(): TestPerformanceMetrics {
  isMonitoring = false;
  const metrics = calculateMetrics();
  console.log('📊 API Performance monitoring stopped');
  console.log(`📈 Total API calls: ${metrics.totalApiCalls}`);
  console.log(`⏱️ Total test time: ${metrics.totalExecutionTime}ms`);
  console.log(`⚡ Average call time: ${metrics.averageCallTime.toFixed(2)}ms`);
  
  return metrics;
}

/**
 * Record an API call
 */
export function recordApiCall(
  endpoint: string,
  method: string,
  duration: number,
  success: boolean,
  error?: string
): void {
  if (!isMonitoring) return;

  const call: ApiCallMetrics = {
    endpoint,
    method,
    duration,
    timestamp: Date.now(),
    success,
    error
  };

  calls.push(call);

  // Log slow calls immediately
  if (duration > config.slowCallThreshold) {
    console.warn(`🐌 Slow API call detected: ${method} ${endpoint} took ${duration}ms`);
  }
}

/**
 * Get current API call count
 */
export function getCurrentCallCount(): number {
  return calls.length;
}

/**
 * Calculate performance metrics (optimized)
 */
export function calculateMetrics(): TestPerformanceMetrics {
  const totalApiCalls = calls.length;
  const totalExecutionTime = Date.now() - testStartTime;
  
  // Single pass through calls for efficiency
  let errorCount = 0;
  let totalDuration = 0;
  let successfulCallCount = 0;
  let slowestCall: ApiCallMetrics | null = null;
  let fastestCall: ApiCallMetrics | null = null;
  let minDuration = Infinity;
  let maxDuration = -Infinity;
  
  const endpointSet = new Set<string>();
  const callsByEndpoint: Record<string, number> = {};
  
  for (const call of calls) {
    // Track endpoints
    endpointSet.add(call.endpoint);
    callsByEndpoint[call.endpoint] = (callsByEndpoint[call.endpoint] || 0) + 1;
    
    if (call.success) {
      successfulCallCount++;
      totalDuration += call.duration;
      
      // Track fastest/slowest calls
      if (call.duration < minDuration) {
        minDuration = call.duration;
        fastestCall = call;
      }
      if (call.duration > maxDuration) {
        maxDuration = call.duration;
        slowestCall = call;
      }
    } else {
      errorCount++;
    }
  }

  const averageCallTime = successfulCallCount > 0 
    ? totalDuration / successfulCallCount
    : 0;

  return {
    totalApiCalls,
    totalExecutionTime,
    averageCallTime,
    slowestCall,
    fastestCall,
    errorCount,
    uniqueEndpoints: Array.from(endpointSet),
    callsByEndpoint
  };
}

/**
 * Check if performance meets thresholds
 */
export function checkThresholds(thresholds: PerformanceThresholds): {
  passed: boolean;
  violations: string[];
  metrics: TestPerformanceMetrics;
} {
  const metrics = calculateMetrics();
  const violations: string[] = [];

  if (metrics.totalApiCalls > thresholds.maxApiCalls) {
    violations.push(`Too many API calls: ${metrics.totalApiCalls} > ${thresholds.maxApiCalls}`);
  }

  if (metrics.totalExecutionTime > thresholds.maxTestDuration) {
    violations.push(`Test duration too long: ${metrics.totalExecutionTime}ms > ${thresholds.maxTestDuration}ms`);
  }

  if (metrics.averageCallTime > thresholds.maxAvgCallTime) {
    violations.push(`Average call time too slow: ${metrics.averageCallTime.toFixed(2)}ms > ${thresholds.maxAvgCallTime}ms`);
  }

  const slowCalls = calls.filter(c => c.duration > config.slowCallThreshold).length;
  if (slowCalls > thresholds.maxSlowCalls) {
    violations.push(`Too many slow calls: ${slowCalls} > ${thresholds.maxSlowCalls}`);
  }

  return {
    passed: violations.length === 0,
    violations,
    metrics
  };
}

/**
 * Generate detailed performance report
 */
export function generateReport(): string {
  const metrics = calculateMetrics();
  
  let report = '\n📊 API Performance Report\n';
  report += '========================\n\n';
  
  report += `🔢 Total API Calls: ${metrics.totalApiCalls}\n`;
  report += `⏱️ Total Test Time: ${metrics.totalExecutionTime}ms\n`;
  report += `⚡ Average Call Time: ${metrics.averageCallTime.toFixed(2)}ms\n`;
  report += `❌ Error Count: ${metrics.errorCount}\n\n`;

  if (metrics.slowestCall) {
    report += `🐌 Slowest Call: ${metrics.slowestCall.method} ${metrics.slowestCall.endpoint} (${metrics.slowestCall.duration}ms)\n`;
  }

  if (metrics.fastestCall) {
    report += `⚡ Fastest Call: ${metrics.fastestCall.method} ${metrics.fastestCall.endpoint} (${metrics.fastestCall.duration}ms)\n\n`;
  }

  report += `🎯 Unique Endpoints: ${metrics.uniqueEndpoints.length}\n`;
  
  report += '\n📈 Calls by Endpoint:\n';
  Object.entries(metrics.callsByEndpoint)
    .sort(([,a], [,b]) => b - a)
    .forEach(([endpoint, count]) => {
      report += `  • ${endpoint}: ${count} calls\n`;
    });

  // Performance insights
  report += '\n💡 Performance Insights:\n';
  
  if (metrics.totalApiCalls > config.insights.highApiCallCount) {
    report += '  ⚠️ High API call count - consider optimizing with shared data\n';
  }
  
  if (metrics.averageCallTime > config.insights.slowAverageTime) {
    report += '  ⚠️ Slow average response time - check network or API performance\n';
  }
  
  const duplicateEndpoints = Object.entries(metrics.callsByEndpoint)
    .filter(([, count]) => count > config.insights.duplicateCallThreshold);
  
  if (duplicateEndpoints.length > 0) {
    report += '  ⚠️ Detected potential optimization opportunities:\n';
    duplicateEndpoints.forEach(([endpoint, count]) => {
      report += `    • ${endpoint}: ${count} calls (consider caching)\n`;
    });
  }

  if (metrics.errorCount === 0 && metrics.totalApiCalls < config.insights.highApiCallCount && metrics.averageCallTime < config.insights.slowAverageTime) {
    report += '  ✅ Excellent performance - well optimized test suite!\n';
  }

  return report;
}

/**
 * Reset monitoring state
 */
export function resetMonitoring(): void {
  calls = [];
  testStartTime = 0;
  isMonitoring = false;
}

/**
 * Get all recorded calls (for debugging)
 */
export function getAllCalls(): ApiCallMetrics[] {
  return [...calls];
}


/**
 * Performance tracking decorator for test methods
 */
export function trackPerformance(target: any, propertyName: string, descriptor: PropertyDescriptor) {
  const method = descriptor.value;

  descriptor.value = async function (...args: any[]) {
    const startTime = Date.now();
    let success = true;
    let error: string | undefined;

    try {
      const result = await method.apply(this, args);
      return result;
    } catch (err) {
      success = false;
      error = err instanceof Error ? err.message : 'Unknown error';
      throw err;
    } finally {
      const duration = Date.now() - startTime;
      recordApiCall(
        propertyName,
        'TEST',
        duration,
        success,
        error
      );
    }
  };

  return descriptor;
}

/**
 * Default performance thresholds for different test types
 */
export const DEFAULT_THRESHOLDS: Record<string, PerformanceThresholds> = {
  unit: {
    maxApiCalls: 5,
    maxTestDuration: 2000,
    maxAvgCallTime: 50,
    maxSlowCalls: 0
  },
  integration: {
    maxApiCalls: 15,
    maxTestDuration: 10000,
    maxAvgCallTime: 200,
    maxSlowCalls: 2
  },
  optimized: {
    maxApiCalls: 10,
    maxTestDuration: 5000,
    maxAvgCallTime: 100,
    maxSlowCalls: 1
  },
  individual: {
    maxApiCalls: 25,
    maxTestDuration: 15000,
    maxAvgCallTime: 250,
    maxSlowCalls: 5
  }
};

/**
 * Jest custom matcher for performance assertions
 */
export function toMeetPerformanceThresholds(
  this: jest.MatcherContext,
  received: TestPerformanceMetrics,
  thresholds: PerformanceThresholds
) {
  const violations: string[] = [];

  if (received.totalApiCalls > thresholds.maxApiCalls) {
    violations.push(`API calls: ${received.totalApiCalls} > ${thresholds.maxApiCalls}`);
  }

  if (received.totalExecutionTime > thresholds.maxTestDuration) {
    violations.push(`Duration: ${received.totalExecutionTime}ms > ${thresholds.maxTestDuration}ms`);
  }

  if (received.averageCallTime > thresholds.maxAvgCallTime) {
    violations.push(`Avg call time: ${received.averageCallTime.toFixed(2)}ms > ${thresholds.maxAvgCallTime}ms`);
  }

  const pass = violations.length === 0;

  if (pass) {
    return {
      message: () => `Performance metrics meet all thresholds`,
      pass: true,
    };
  } else {
    return {
      message: () => `Performance thresholds violated:\n${violations.map(v => `  • ${v}`).join('\n')}`,
      pass: false,
    };
  }
}

// Extend Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toMeetPerformanceThresholds(thresholds: PerformanceThresholds): R;
    }
  }
}