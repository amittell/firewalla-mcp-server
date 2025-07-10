/**
 * Retry Management Utilities for Firewalla MCP Server
 * Provides exponential backoff retry logic for timeout-prone operations
 */

import { TimeoutError } from './timeout-manager.js';
import { logger } from '../monitoring/logger.js';

/**
 * Enhanced error with retry context information
 */
export interface RetryFailureError extends Error {
  retryContext: {
    originalError: unknown;
    toolName: string;
    attempts: number;
    totalDurationMs: number;
    attemptDetails: Array<{
      attempt: number;
      durationMs: number;
      error?: string | unknown;
      delayMs?: number;
    }>;
  };
  userGuidance: string[];
}

/**
 * Retry configuration options
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts?: number;
  /** Initial delay in milliseconds */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds */
  maxDelayMs?: number;
  /** Exponential backoff multiplier */
  backoffMultiplier?: number;
  /** Whether to add jitter to prevent thundering herd */
  addJitter?: boolean;
  /** Function to determine if an error should trigger a retry */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
  /** Tool name for logging context */
  toolName?: string;
}

/**
 * Default retry configuration
 */
const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  addJitter: true,
  shouldRetry: (error: unknown, _attempt: number) => {
    // Retry on timeout errors and network-related errors
    if (error instanceof TimeoutError) {
      return true;
    }
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      // Retry on common transient errors
      return (
        message.includes('timeout') ||
        message.includes('network') ||
        message.includes('connection') ||
        message.includes('temporarily unavailable') ||
        message.includes('rate limit') ||
        message.includes('503') ||
        message.includes('502') ||
        message.includes('504')
      );
    }
    return false;
  },
  toolName: 'unknown',
};

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  /** The successful result */
  result?: T;
  /** The final error if all retries failed */
  error?: unknown;
  /** Number of attempts made */
  attempts: number;
  /** Total time spent retrying */
  totalDurationMs: number;
  /** Whether the operation ultimately succeeded */
  success: boolean;
  /** Retry attempt details */
  attemptDetails: Array<{
    attempt: number;
    durationMs: number;
    error?: unknown;
    delayMs?: number;
  }>;
}

/**
 * Retry manager class for handling retries with exponential backoff
 */
export class RetryManager {
  /**
   * Execute an operation with retry logic
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    const startTime = Date.now();
    const attemptDetails: Array<{
      attempt: number;
      durationMs: number;
      error?: unknown;
      delayMs?: number;
    }> = [];

    let lastError: unknown;

    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      const attemptStartTime = Date.now();

      try {
        const result = await operation();
        const attemptDuration = Date.now() - attemptStartTime;

        attemptDetails.push({
          attempt,
          durationMs: attemptDuration,
        });

        // Success on attempt
        if (attempt > 1) {
          logger.info(
            `Operation '${finalConfig.toolName}' succeeded after retry`,
            {
              tool: finalConfig.toolName,
              attempt,
              max_attempts: finalConfig.maxAttempts,
              retry_action: 'success_after_retry',
            }
          );
        }

        return result;
      } catch (error) {
        const attemptDuration = Date.now() - attemptStartTime;
        lastError = error;

        attemptDetails.push({
          attempt,
          durationMs: attemptDuration,
          error,
        });

        // Check if we should retry this error
        if (!finalConfig.shouldRetry(error, attempt)) {
          logger.warn(
            `Operation '${finalConfig.toolName}' failed with non-retryable error`,
            {
              tool: finalConfig.toolName,
              attempt,
              error: error instanceof Error ? error.message : 'Unknown error',
              retry_action: 'abort_non_retryable',
            }
          );
          throw error;
        }

        // If this was the last attempt, throw the error
        if (attempt === finalConfig.maxAttempts) {
          const totalDuration = Date.now() - startTime;
          logger.error(
            `Operation '${finalConfig.toolName}' failed after all retry attempts`,
            error instanceof Error ? error : undefined,
            {
              tool: finalConfig.toolName,
              attempts: attempt,
              total_duration_ms: totalDuration,
              final_error:
                error instanceof Error ? error.message : 'Unknown error',
              attempt_details: attemptDetails,
              retry_action: 'final_failure',
            }
          );

          // Enhance the error with retry context
          const enhancedError = this.createRetryFailureError(
            error,
            finalConfig.toolName,
            attempt,
            totalDuration,
            attemptDetails
          );
          throw enhancedError;
        }

        // Calculate delay for next attempt
        const baseDelay =
          finalConfig.initialDelayMs *
          Math.pow(finalConfig.backoffMultiplier, attempt - 1);
        let delay = Math.min(baseDelay, finalConfig.maxDelayMs);

        // Add jitter to prevent thundering herd
        if (finalConfig.addJitter) {
          delay = delay * (0.5 + Math.random() * 0.5);
        }

        attemptDetails[attemptDetails.length - 1].delayMs = delay;

        logger.warn(`Operation '${finalConfig.toolName}' failed, retrying`, {
          tool: finalConfig.toolName,
          attempt,
          max_attempts: finalConfig.maxAttempts,
          retry_delay_ms: Math.round(delay),
          error: error instanceof Error ? error.message : 'Unknown error',
          retry_action: 'retry_attempt',
        });

        // Wait before next attempt
        await this.delay(delay);
      }
    }

    // This should never be reached, but just in case
    throw lastError;
  }

  /**
   * Create a delay promise
   */
  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create an enhanced error with retry context
   */
  private createRetryFailureError(
    originalError: unknown,
    toolName: string,
    attempts: number,
    totalDurationMs: number,
    attemptDetails: Array<{
      attempt: number;
      durationMs: number;
      error?: unknown;
      delayMs?: number;
    }>
  ): RetryFailureError {
    const originalMessage =
      originalError instanceof Error ? originalError.message : 'Unknown error';

    const enhancedMessage = `Operation '${toolName}' failed after ${attempts} retry attempts (${totalDurationMs}ms total). Final error: ${originalMessage}`;

    const enhancedError = new Error(enhancedMessage) as RetryFailureError;
    enhancedError.name = 'RetryFailureError';

    // Add retry context
    enhancedError.retryContext = {
      originalError,
      toolName,
      attempts,
      totalDurationMs,
      attemptDetails: attemptDetails.map(detail => ({
        attempt: detail.attempt,
        durationMs: detail.durationMs,
        error:
          detail.error instanceof Error ? detail.error.message : detail.error,
        delayMs: detail.delayMs,
      })),
    };

    // Add user-friendly guidance
    enhancedError.userGuidance = this.generateUserGuidance(
      originalError,
      toolName,
      attempts
    );

    return enhancedError;
  }

  /**
   * Generate user-friendly guidance based on the error pattern
   */
  private generateUserGuidance(
    error: unknown,
    toolName: string,
    attempts: number
  ): string[] {
    const guidance: string[] = [];

    if (error instanceof TimeoutError) {
      guidance.push(
        `The operation timed out after ${attempts} attempts. Try reducing the scope of your request.`,
        'Consider using smaller limit parameters or more specific filters.',
        'If searching by time range, try narrower time windows.',
        'Network connectivity issues may be causing timeouts - check your connection.'
      );
    } else if (error instanceof Error) {
      const message = error.message.toLowerCase();

      if (message.includes('network') || message.includes('connection')) {
        guidance.push(
          'Network connectivity issues detected. Check your internet connection.',
          'Verify that the Firewalla API endpoints are accessible.',
          'Try again in a few minutes as this may be a temporary network issue.'
        );
      } else if (message.includes('rate limit')) {
        guidance.push(
          'API rate limit exceeded. Wait a few minutes before trying again.',
          'Consider reducing the frequency of your requests.',
          'Break large operations into smaller, spaced-out requests.'
        );
      } else if (
        message.includes('503') ||
        message.includes('502') ||
        message.includes('504')
      ) {
        guidance.push(
          'Firewalla API server is temporarily unavailable.',
          'This is usually a temporary issue - try again in a few minutes.',
          'Check Firewalla system status if the issue persists.'
        );
      } else if (message.includes('unauthorized') || message.includes('403')) {
        guidance.push(
          'Authentication or authorization failed. Check your API credentials.',
          'Verify your MSP token is still valid and has the required permissions.',
          'Ensure you have access to the requested Firewalla box.'
        );
      } else {
        guidance.push(
          `${toolName} operation failed after ${attempts} attempts.`,
          'Check the error details above for specific information.',
          'Try with different parameters or contact support if the issue persists.'
        );
      }
    }

    return guidance;
  }
}

/**
 * Global retry manager instance
 */
export const globalRetryManager = new RetryManager();

/**
 * Convenience function for wrapping operations with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  toolName: string,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  return globalRetryManager.withRetry(operation, {
    ...config,
    toolName,
  });
}

/**
 * Check if an error is retryable based on common patterns
 */
export function isRetryableError(error: unknown): boolean {
  return DEFAULT_RETRY_CONFIG.shouldRetry(error, 1);
}

/**
 * Create retry-aware timeout wrapper that combines timeout and retry logic
 */
export async function withRetryAndTimeout<T>(
  operation: () => Promise<T>,
  toolName: string,
  retryConfig: Partial<RetryConfig> = {},
  timeoutMs?: number
): Promise<T> {
  // Import timeout function dynamically to avoid circular dependency
  const { withToolTimeout } = await import('./timeout-manager.js');

  return withRetry(
    async () => withToolTimeout(operation, toolName, timeoutMs),
    toolName,
    retryConfig
  );
}
