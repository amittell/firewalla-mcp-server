/**
 * API Call Performance Monitor for Test Optimization
 * 
 * Tracks API calls, execution times, and provides performance metrics
 * to measure the effectiveness of test optimization strategies.
 */

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
 * Performance monitor for tracking API calls and test execution
 */
export class ApiPerformanceMonitor {
  private static calls: ApiCallMetrics[] = [];
  private static testStartTime = 0;
  private static isMonitoring = false;

  /**
   * Start monitoring API calls
   */
  static startMonitoring(): void {
    this.isMonitoring = true;
    this.testStartTime = Date.now();
    this.calls = [];
    console.log('📊 API Performance monitoring started');
  }

  /**
   * Stop monitoring and return results
   */
  static stopMonitoring(): TestPerformanceMetrics {
    this.isMonitoring = false;
    const metrics = this.calculateMetrics();
    console.log('📊 API Performance monitoring stopped');
    console.log(`📈 Total API calls: ${metrics.totalApiCalls}`);
    console.log(`⏱️ Total test time: ${metrics.totalExecutionTime}ms`);
    console.log(`⚡ Average call time: ${metrics.averageCallTime.toFixed(2)}ms`);
    
    return metrics;
  }

  /**
   * Record an API call
   */
  static recordApiCall(
    endpoint: string,
    method: string,
    duration: number,
    success: boolean,
    error?: string
  ): void {
    if (!this.isMonitoring) return;

    const call: ApiCallMetrics = {
      endpoint,
      method,
      duration,
      timestamp: Date.now(),
      success,
      error
    };

    this.calls.push(call);

    // Log slow calls immediately
    if (duration > 1000) {
      console.warn(`🐌 Slow API call detected: ${method} ${endpoint} took ${duration}ms`);
    }
  }

  /**
   * Get current API call count
   */
  static getCurrentCallCount(): number {
    return this.calls.length;
  }

  /**
   * Calculate performance metrics
   */
  static calculateMetrics(): TestPerformanceMetrics {
    const totalApiCalls = this.calls.length;
    const totalExecutionTime = Date.now() - this.testStartTime;
    const successfulCalls = this.calls.filter(c => c.success);
    const errorCount = this.calls.filter(c => !c.success).length;

    const durations = successfulCalls.map(c => c.duration);
    const averageCallTime = durations.length > 0 
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length 
      : 0;

    const slowestCall = durations.length > 0 
      ? this.calls.find(c => c.duration === Math.max(...durations)) || null
      : null;

    const fastestCall = durations.length > 0 
      ? this.calls.find(c => c.duration === Math.min(...durations)) || null
      : null;

    const uniqueEndpoints = [...new Set(this.calls.map(c => c.endpoint))];
    
    const callsByEndpoint = this.calls.reduce((acc, call) => {
      acc[call.endpoint] = (acc[call.endpoint] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalApiCalls,
      totalExecutionTime,
      averageCallTime,
      slowestCall,
      fastestCall,
      errorCount,
      uniqueEndpoints,
      callsByEndpoint
    };
  }

  /**
   * Check if performance meets thresholds
   */
  static checkThresholds(thresholds: PerformanceThresholds): {
    passed: boolean;
    violations: string[];
    metrics: TestPerformanceMetrics;
  } {
    const metrics = this.calculateMetrics();
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

    const slowCalls = this.calls.filter(c => c.duration > 1000).length;
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
  static generateReport(): string {
    const metrics = this.calculateMetrics();
    
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
    
    if (metrics.totalApiCalls > 20) {
      report += '  ⚠️ High API call count - consider optimizing with shared data\n';
    }
    
    if (metrics.averageCallTime > 100) {
      report += '  ⚠️ Slow average response time - check network or API performance\n';
    }
    
    const duplicateEndpoints = Object.entries(metrics.callsByEndpoint)
      .filter(([, count]) => count > 3);
    
    if (duplicateEndpoints.length > 0) {
      report += '  ⚠️ Detected potential optimization opportunities:\n';
      duplicateEndpoints.forEach(([endpoint, count]) => {
        report += `    • ${endpoint}: ${count} calls (consider caching)\n`;
      });
    }

    if (metrics.errorCount === 0 && metrics.totalApiCalls < 15 && metrics.averageCallTime < 50) {
      report += '  ✅ Excellent performance - well optimized test suite!\n';
    }

    return report;
  }

  /**
   * Reset monitoring state
   */
  static reset(): void {
    this.calls = [];
    this.testStartTime = 0;
    this.isMonitoring = false;
  }

  /**
   * Get all recorded calls (for debugging)
   */
  static getAllCalls(): ApiCallMetrics[] {
    return [...this.calls];
  }
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
      ApiPerformanceMonitor.recordApiCall(
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