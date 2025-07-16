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
 * Timeout error class for actual timeout situations
 */
export class TimeoutError extends Error {
  public readonly isTimeout = true;
  public readonly duration: number;
  public readonly toolName: string;

  constructor(toolName: string, duration: number, timeoutMs: number) {
    super(
      `Operation '${toolName}' timed out after ${duration}ms (limit: ${timeoutMs}ms). This indicates the operation took too long to complete, likely due to large data volumes or API performance issues.`
    );
    this.name = 'TimeoutError';
    this.duration = duration;
    this.toolName = toolName;
  }
}

/**
 * Validation error class for immediate parameter/validation failures
 */
export class ValidationError extends Error {
  public readonly isValidation = true;
  public readonly duration: number;
  public readonly toolName: string;

  constructor(toolName: string, duration: number, originalError: string) {
    super(
      `Tool '${toolName}' failed validation: ${originalError}. This is an immediate parameter or configuration error, not a timeout (completed in ${duration}ms).`
    );
    this.name = 'ValidationError';
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
    // Ensure timeoutMs is never undefined by using nullish coalescing
    const finalConfig = {
      ...DEFAULT_TIMEOUT_CONFIG,
      ...config,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_CONFIG.timeoutMs,
    };
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
          logger.error(
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
      timeoutMs: customTimeoutMs ?? DEFAULT_TIMEOUT_CONFIG.timeoutMs,
      enableMetrics: true,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    // Enhanced immediate failure detection
    if (duration < 50) {
      // This is likely an immediate validation failure, not a timeout
      logger.warn(`Immediate validation failure detected`, {
        tool: toolName,
        duration_ms: duration,
        error: error instanceof Error ? error.message : 'Unknown error',
        error_type: error?.constructor?.name,
        is_actual_timeout: error instanceof TimeoutError,
        warning: 'immediate_validation_failure',
      });

      // Convert immediate failures to ValidationError for clarity
      if (error instanceof Error && !(error instanceof TimeoutError)) {
        throw new ValidationError(toolName, duration, error.message);
      }
    }

    // Handle actual timeout errors
    if (error instanceof TimeoutError) {
      logger.error(
        `Actual timeout occurred - operation exceeded time limit`,
        error instanceof Error ? error : undefined,
        {
          tool: toolName,
          duration_ms: duration,
          timeout_limit_ms: customTimeoutMs || 30000,
          error_type: 'actual_timeout',
        }
      );
      throw error; // Re-throw actual timeout errors
    }

    // For other errors that took longer (may be slow validation or processing errors)
    if (error instanceof Error) {
      // If it's not immediate and not a timeout, it might be a slow processing error
      if (duration >= 50 && duration < (customTimeoutMs || 30000)) {
        const processingError = new Error(
          `Tool '${toolName}' failed after ${duration}ms: ${error.message}. This appears to be a processing error, not a timeout.`
        );
        processingError.name = error.name;
        processingError.stack = error.stack;
        // Add debugging information as a property
        (processingError as any).debugInfo = {
          duration,
          toolName,
          originalError: error.message,
          wasImmediate: false,
          wasTimeout: false,
          errorCategory: 'processing_error',
        };
        throw processingError;
      }

      // For any other edge cases, preserve original error
      throw error;
    }

    throw error;
  }
}

/**
 * Generate actionable guidance for validation errors
 */
function generateValidationGuidance(
  toolName: string,
  duration: number,
  originalError: string
): string[] {
  const guidance: string[] = [];

  // General validation guidance
  guidance.push(
    `Validation failed immediately (${duration}ms).`,
    'This is a parameter or configuration error, not a performance issue.',
    `Original error: ${originalError}`
  );

  // Tool-specific validation guidance
  guidance.push(
    '',
    '🔧 Common Parameter Issues:',
    '• Check that all required parameters are provided',
    '• Verify parameter types match the expected format',
    '• Ensure numeric parameters are within valid ranges',
    '• Check that enum values are from the allowed list',
    '• Verify API credentials and box configuration'
  );

  if (originalError.toLowerCase().includes('limit')) {
    guidance.push(
      '',
      '📊 Limit Parameter Issues:',
      '• The limit parameter is required for most tools',
      '• Limit must be a positive integer',
      '• Consider reasonable limits (10-1000 for most operations)',
      '• Some tools have maximum limit restrictions'
    );
  }

  if (
    originalError.toLowerCase().includes('auth') ||
    originalError.toLowerCase().includes('credential')
  ) {
    guidance.push(
      '',
      '🔐 Authentication Issues:',
      '• Verify FIREWALLA_MSP_TOKEN is set correctly',
      '• Check FIREWALLA_MSP_ID matches your domain',
      '• Ensure FIREWALLA_BOX_ID is the correct box identifier',
      '• Confirm the API token has necessary permissions'
    );
  }

  // Add tool-specific validation guidance
  if (toolName.includes('search')) {
    guidance.push(
      '',
      '🔍 Search Tool Validation:',
      '• Ensure query syntax is correct',
      '• Check that search fields are valid',
      '• Verify time range format (ISO 8601)'
    );
  } else if (toolName.includes('rule')) {
    guidance.push(
      '',
      '🛡️ Rule Tool Validation:',
      '• Confirm rule IDs exist',
      '• Check rule action values (block, allow, timelimit)',
      '• Verify target format matches expected pattern'
    );
  } else if (toolName.includes('device')) {
    guidance.push(
      '',
      '📱 Device Tool Validation:',
      '• Check device ID format',
      '• Verify network scope parameters',
      '• Ensure status filters are valid'
    );
  }

  return guidance;
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
 * Create a standardized validation error response for MCP tools
 */
export function createValidationErrorResponse(
  toolName: string,
  duration: number,
  originalError: string
): {
  content: Array<{ type: string; text: string }>;
  isError: true;
} {
  const guidance = generateValidationGuidance(
    toolName,
    duration,
    originalError
  );

  return createErrorResponse(
    toolName,
    guidance.join('\n'),
    ErrorType.VALIDATION_ERROR,
    {
      duration,
      originalError,
      validation_context: {
        was_immediate: duration < 50,
        error_category: originalError.toLowerCase().includes('limit')
          ? 'missing_parameter'
          : originalError.toLowerCase().includes('auth')
            ? 'authentication'
            : 'parameter_validation',
        operation_category: toolName.includes('search')
          ? 'search'
          : toolName.includes('rule')
            ? 'rule_management'
            : toolName.includes('device')
              ? 'device_monitoring'
              : 'general',
      },
      documentation: {
        validation_guide: '/docs/error-handling-guide.md#validation-errors',
        parameter_guide: '/docs/firewalla-api-reference.md#parameters',
        authentication_guide: '/docs/firewalla-api-reference.md#authentication',
      },
    },
    [
      'Parameter validation failed - this is not a timeout',
      'Check the specific error message for parameter requirements',
      'Verify all required parameters are provided',
      'Ensure parameter values match expected types and ranges',
      'See the validation troubleshooting guide for common fixes',
    ]
  );
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
        was_actual_timeout: duration >= timeoutMs,
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
      'Actual timeout occurred - operation exceeded time limit',
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
