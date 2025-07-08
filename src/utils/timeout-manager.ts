/**
 * Timeout Management Utilities for Firewalla MCP Server
 * Provides consistent timeout handling across all tools and operations
 */

import { PERFORMANCE_THRESHOLDS } from '../config/limits.js';
import { ErrorType, createErrorResponse } from '../validation/error-handler.js';
import { logger } from '../monitoring/logger.js';

/**
 * Timeout configuration options
 */
export interface TimeoutConfig {
  /** Timeout duration in milliseconds */
  timeoutMs?: number;
  /** Warning threshold in milliseconds */
  warningMs?: number;
  /** Error threshold in milliseconds */
  errorMs?: number;
  /** Whether to log performance metrics */
  enableMetrics?: boolean;
  /** Tool name for context */
  toolName?: string;
}

/**
 * Default timeout configuration
 */
const DEFAULT_TIMEOUT_CONFIG: Required<TimeoutConfig> = {
  timeoutMs: PERFORMANCE_THRESHOLDS.TIMEOUT_MS,
  warningMs: PERFORMANCE_THRESHOLDS.WARNING_MS,
  errorMs: PERFORMANCE_THRESHOLDS.ERROR_MS,
  enableMetrics: true,
  toolName: 'unknown',
};

/**
 * Performance metrics for monitoring
 */
export interface PerformanceMetrics {
  startTime: number;
  endTime?: number;
  duration?: number;
  toolName: string;
  success: boolean;
  timedOut: boolean;
  warning: boolean;
  error: boolean;
}

/**
 * Timeout error class for better error handling
 */
export class TimeoutError extends Error {
  public readonly isTimeout = true;
  public readonly duration: number;
  public readonly toolName: string;

  constructor(toolName: string, duration: number, timeoutMs: number) {
    super(
      `Operation '${toolName}' timed out after ${duration}ms (limit: ${timeoutMs}ms)`
    );
    this.name = 'TimeoutError';
    this.duration = duration;
    this.toolName = toolName;
  }
}

/**
 * Performance warning class for monitoring
 */
export class PerformanceWarning extends Error {
  public readonly isWarning = true;
  public readonly duration: number;
  public readonly toolName: string;

  constructor(toolName: string, duration: number, threshold: number) {
    super(
      `Operation '${toolName}' took ${duration}ms (warning threshold: ${threshold}ms)`
    );
    this.name = 'PerformanceWarning';
    this.duration = duration;
    this.toolName = toolName;
  }
}

/**
 * Timeout manager class for handling operation timeouts
 */
export class TimeoutManager {
  private activeTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private metrics: PerformanceMetrics[] = [];
  private readonly maxMetrics = 1000; // Keep last 1000 operations

  /**
   * Execute an async operation with timeout protection
   */
  async withTimeout<T>(
    operation: () => Promise<T>,
    config: Partial<TimeoutConfig> = {}
  ): Promise<T> {
    const finalConfig = { ...DEFAULT_TIMEOUT_CONFIG, ...config };
    const operationId = `${finalConfig.toolName}_${Date.now()}_${Math.random()}`;

    const metrics: PerformanceMetrics = {
      startTime: Date.now(),
      toolName: finalConfig.toolName,
      success: false,
      timedOut: false,
      warning: false,
      error: false,
    };

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          const duration = Date.now() - metrics.startTime;
          metrics.timedOut = true;
          metrics.endTime = Date.now();
          metrics.duration = duration;
          this.recordMetrics(metrics);
          reject(
            new TimeoutError(
              finalConfig.toolName,
              duration,
              finalConfig.timeoutMs
            )
          );
        }, finalConfig.timeoutMs);

        this.activeTimeouts.set(operationId, timeoutId);
      });

      // Race the operation against the timeout
      const result = await Promise.race([operation(), timeoutPromise]);

      // Operation completed successfully
      metrics.endTime = Date.now();
      metrics.duration = metrics.endTime - metrics.startTime;
      metrics.success = true;

      // Check for performance warnings
      if (metrics.duration > finalConfig.warningMs) {
        metrics.warning = true;
        if (finalConfig.enableMetrics) {
          const warning = new PerformanceWarning(
            finalConfig.toolName,
            metrics.duration,
            finalConfig.warningMs
          );
          logger.warn(warning.message, {
            tool: finalConfig.toolName,
            duration_ms: metrics.duration,
            warning_threshold_ms: finalConfig.warningMs,
            warning: 'performance_warning',
          });
        }
      }

      if (metrics.duration > finalConfig.errorMs) {
        metrics.error = true;
        if (finalConfig.enableMetrics) {
          // eslint-disable-next-line no-console
          console.error(
            `Performance error: ${finalConfig.toolName} took ${metrics.duration}ms (error threshold: ${finalConfig.errorMs}ms)`
          );
        }
      }

      this.recordMetrics(metrics);
      return result;
    } catch (error) {
      metrics.endTime = Date.now();
      metrics.duration = metrics.endTime - metrics.startTime;

      if (error instanceof TimeoutError) {
        metrics.timedOut = true;
      }

      // Debug logging for extremely fast failures that might be misclassified as timeouts
      if (metrics.duration < 100 && finalConfig.enableMetrics) {
        logger.warn(`Suspiciously fast operation failure`, {
          tool: finalConfig.toolName,
          duration_ms: metrics.duration,
          error: error instanceof Error ? error.message : 'Unknown error',
          is_timeout: error instanceof TimeoutError,
          error_type: error?.constructor?.name,
          warning: 'fast_failure',
        });
      }

      this.recordMetrics(metrics);
      throw error;
    } finally {
      // Clean up timeout
      const timeoutId = this.activeTimeouts.get(operationId);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.activeTimeouts.delete(operationId);
      }
    }
  }

  /**
   * Create a timeout-wrapped version of an async function
   */
  wrapWithTimeout<T extends any[], R>(
    fn: (...args: T) => Promise<R>,
    config: Partial<TimeoutConfig> = {}
  ): (...args: T) => Promise<R> {
    return async (...args: T): Promise<R> => {
      return this.withTimeout(async () => fn(...args), config);
    };
  }

  /**
   * Record performance metrics
   */
  private recordMetrics(metrics: PerformanceMetrics): void {
    this.metrics.push(metrics);

    // Keep only the most recent metrics to prevent memory leaks
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.splice(0, this.metrics.length - this.maxMetrics);
    }
  }

  /**
   * Get performance metrics for a specific tool
   */
  getMetrics(toolName?: string): PerformanceMetrics[] {
    if (toolName) {
      return this.metrics.filter(m => m.toolName === toolName);
    }
    return [...this.metrics];
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats(toolName?: string): {
    totalOperations: number;
    successRate: number;
    timeoutRate: number;
    warningRate: number;
    averageDuration: number;
    maxDuration: number;
    minDuration: number;
  } {
    const relevantMetrics = this.getMetrics(toolName);

    if (relevantMetrics.length === 0) {
      return {
        totalOperations: 0,
        successRate: 0,
        timeoutRate: 0,
        warningRate: 0,
        averageDuration: 0,
        maxDuration: 0,
        minDuration: 0,
      };
    }

    const durations = relevantMetrics
      .filter(m => m.duration !== undefined)
      .map(m => m.duration!);

    return {
      totalOperations: relevantMetrics.length,
      successRate:
        relevantMetrics.filter(m => m.success).length / relevantMetrics.length,
      timeoutRate:
        relevantMetrics.filter(m => m.timedOut).length / relevantMetrics.length,
      warningRate:
        relevantMetrics.filter(m => m.warning).length / relevantMetrics.length,
      averageDuration:
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0,
      maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
      minDuration: durations.length > 0 ? Math.min(...durations) : 0,
    };
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clearMetrics(): void {
    this.metrics = [];
  }

  /**
   * Cancel all active timeouts (useful for cleanup)
   */
  cancelAllTimeouts(): void {
    for (const timeoutId of this.activeTimeouts.values()) {
      clearTimeout(timeoutId);
    }
    this.activeTimeouts.clear();
  }

  /**
   * Get the number of active operations
   */
  getActiveOperationsCount(): number {
    return this.activeTimeouts.size;
  }
}

/**
 * Global timeout manager instance
 */
export const globalTimeoutManager = new TimeoutManager();

/**
 * Convenience function for wrapping tool operations with timeout
 */
export async function withToolTimeout<T>(
  operation: () => Promise<T>,
  toolName: string,
  customTimeoutMs?: number
): Promise<T> {
  const startTime = Date.now();

  try {
    return await globalTimeoutManager.withTimeout(operation, {
      toolName,
      timeoutMs: customTimeoutMs,
      enableMetrics: true,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    // Enhanced immediate failure detection
    if (duration < 50) {
      // This is likely an immediate validation failure, not a timeout
      logger.warn(`Immediate failure detected`, {
        tool: toolName,
        duration_ms: duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        error_type: error?.constructor?.name,
        is_actual_timeout: error instanceof TimeoutError,
        warning: 'immediate_failure',
      });

      // Don't wrap immediate failures - they're validation errors, not timeouts
      if (error instanceof Error && !(error instanceof TimeoutError)) {
        // Preserve the original error without timeout context
        throw error;
      }
    }

    // Handle actual timeout errors
    if (error instanceof TimeoutError) {
      logger.error(
        `Actual timeout occurred`,
        error instanceof Error ? error : undefined,
        {
          tool: toolName,
          duration_ms: duration,
          timeout_limit_ms: customTimeoutMs || 30000,
          error_type: 'timeout',
        }
      );
      throw error; // Re-throw actual timeout errors
    }

    // For other errors, preserve the original error type with enhanced context
    if (error instanceof Error) {
      // Add context about the tool but preserve the original error
      const enhancedError = new Error(
        `Tool '${toolName}' failed: ${error.message}`
      );
      enhancedError.name = error.name;
      enhancedError.stack = error.stack;
      // Add debugging information as a property
      (enhancedError as any).debugInfo = {
        duration,
        toolName,
        originalError: error.message,
        wasImmediate: duration < 50,
      };
      throw enhancedError;
    }

    throw error;
  }
}

/**
 * Generate actionable guidance based on tool name and timeout context
 */
function generateTimeoutGuidance(
  toolName: string,
  duration: number,
  timeoutMs: number
): string[] {
  const guidance: string[] = [];

  // General timeout guidance
  guidance.push(
    `Operation timed out after ${duration}ms (limit: ${timeoutMs}ms).`,
    'This usually indicates the request scope is too large or the API is under heavy load.'
  );

  // Tool-specific guidance
  if (
    toolName.includes('search') ||
    toolName.includes('flow') ||
    toolName.includes('alarm')
  ) {
    guidance.push(
      '🔍 Search Optimization Tips:',
      '• Reduce the limit parameter (try 100-500 instead of 1000+)',
      '• Add more specific filters to narrow results',
      '• Use time_range filters to limit the search window',
      '• Try cursor-based pagination for large datasets'
    );

    if (toolName.includes('flow')) {
      guidance.push(
        '• Flow searches: Use protocol filters (e.g., "protocol:tcp")',
        '• Flow searches: Filter by specific IPs or subnets',
        '• Flow searches: Limit to recent time periods (last hour/day)'
      );
    }

    if (toolName.includes('alarm')) {
      guidance.push(
        '• Alarm searches: Filter by severity (e.g., "severity:high")',
        '• Alarm searches: Use resolved:false to get active alarms only',
        '• Alarm searches: Search by specific alarm types'
      );
    }
  } else if (toolName.includes('rule')) {
    guidance.push(
      '🛡️ Rule Operation Tips:',
      '• Use active_only:true to reduce dataset size',
      '• Filter by specific rule actions (block, allow, timelimit)',
      '• Search for rules by target type or value',
      '• Consider using get_network_rules_summary for large rule sets'
    );
  } else if (toolName.includes('device')) {
    guidance.push(
      '📱 Device Query Tips:',
      '• Use online:true to focus on active devices',
      '• Filter by device vendor or type',
      '• Limit to specific network segments',
      '• Use cursor pagination for large device lists'
    );
  } else if (
    toolName.includes('geographic') ||
    toolName.includes('correlation')
  ) {
    guidance.push(
      '🌍 Geographic/Correlation Tips:',
      '• These operations are computationally intensive',
      '• Reduce the number of correlation fields',
      '• Use smaller time windows for analysis',
      '• Consider breaking into multiple smaller queries'
    );
  }

  // Network and system guidance
  guidance.push(
    '',
    '🔧 Troubleshooting Steps:',
    '1. Check your network connection to the Firewalla API',
    '2. Verify the Firewalla box is online and responsive',
    '3. Try the same operation with a much smaller limit (e.g., 10-50)',
    '4. Check if other tools work to isolate the issue',
    '5. Wait a few minutes and retry in case of temporary API overload'
  );

  // Recovery suggestions
  guidance.push(
    '',
    '💡 Recovery Suggestions:',
    '• Break large requests into multiple smaller ones',
    '• Use more specific filters to reduce data processing',
    '• Try the operation during off-peak hours',
    '• Consider using summary tools instead of detailed searches',
    '• Enable retry logic for automatic recovery from transient timeouts'
  );

  return guidance;
}

/**
 * Create a standardized timeout error response for MCP tools with enhanced guidance
 */
export function createTimeoutErrorResponse(
  toolName: string,
  duration: number,
  timeoutMs: number
): {
  content: Array<{ type: string; text: string }>;
  isError: true;
} {
  const guidance = generateTimeoutGuidance(toolName, duration, timeoutMs);

  return createErrorResponse(
    toolName,
    guidance.join('\n'),
    ErrorType.TIMEOUT_ERROR,
    {
      duration,
      timeoutMs,
      performance_context: {
        timeout_ratio: Math.round((duration / timeoutMs) * 100),
        operation_category: toolName.includes('search')
          ? 'search'
          : toolName.includes('rule')
            ? 'rule_management'
            : toolName.includes('device')
              ? 'device_monitoring'
              : 'general',
      },
      documentation: {
        timeout_guide: '/docs/error-handling-guide.md#timeout-errors',
        performance_guide: '/docs/limits-and-performance-guide.md',
        query_optimization: '/docs/query-syntax-guide.md#optimization-tips',
      },
    },
    [
      'Timeout occurred - operation took too long to complete',
      'Try reducing the scope of your request or using more specific filters',
      'Check network connectivity and Firewalla API status',
      'Consider breaking large operations into smaller chunks',
      'See the timeout troubleshooting guide for detailed recovery steps',
    ]
  );
}

/**
 * Create a performance warning response for MCP tools
 */
export function createPerformanceWarningResponse(
  toolName: string,
  duration: number,
  threshold: number
): string {
  return `Performance warning: ${toolName} took ${duration}ms (threshold: ${threshold}ms). Consider optimizing your query.`;
}
