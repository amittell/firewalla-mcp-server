/**
 * Bulk Operation Management for Firewalla MCP Server
 * Provides infrastructure for performing operations on multiple resources efficiently
 */

import {
  ParameterValidator,
} from '../validation/error-handler.js';
import { withToolTimeout, TimeoutError } from './timeout-manager.js';
import type { FirewallaClient } from '../firewalla/client.js';

/**
 * Result for a single item in a bulk operation
 */
export interface BulkOperationItemResult {
  /** The ID of the item that was processed */
  id: string;
  /** Whether the operation succeeded for this item */
  success: boolean;
  /** Error message if the operation failed */
  error?: string;
  /** Error type if the operation failed */
  errorType?: string;
  /** Additional result data if available */
  data?: any;
}

/**
 * Overall result for a bulk operation
 */
export interface BulkOperationResult {
  /** Total number of items processed */
  total: number;
  /** Number of successful operations */
  successful: number;
  /** Number of failed operations */
  failed: number;
  /** Results for each individual item */
  results: BulkOperationItemResult[];
  /** Summary statistics */
  summary: {
    success_rate: number;
    processing_time_ms: number;
    errors_by_type: Record<string, number>;
  };
  /** Any warnings or notes about the operation */
  warnings?: string[];
}

/**
 * Configuration for bulk operations
 */
export interface BulkOperationConfig {
  /** Maximum number of items that can be processed in a single bulk operation */
  maxItems: number;
  /** Whether to continue processing if some items fail */
  continueOnFailure: boolean;
  /** Timeout for the entire bulk operation (in milliseconds) */
  timeoutMs: number;
  /** Number of items to process concurrently */
  concurrency: number;
  /** Whether to collect detailed error information */
  collectDetailedErrors: boolean;
}

/**
 * Default configuration for bulk operations
 */
const DEFAULT_BULK_CONFIG: BulkOperationConfig = {
  maxItems: 100,
  continueOnFailure: true,
  timeoutMs: 30000, // 30 seconds
  concurrency: 5,
  collectDetailedErrors: true,
};

/**
 * Function type for individual operations within a bulk operation
 */
export type BulkOperationFunction<T = any> = (
  id: string,
  firewalla: FirewallaClient,
  index: number
) => Promise<T>;

/**
 * Manager class for handling bulk operations
 */
export class BulkOperationManager {
  private config: BulkOperationConfig;

  constructor(config: Partial<BulkOperationConfig> = {}) {
    this.config = { ...DEFAULT_BULK_CONFIG, ...config };
  }

  /**
   * Validate bulk operation parameters
   */
  validateBulkParams(ids: any): {
    isValid: boolean;
    errors: string[];
    sanitizedIds: string[];
  } {
    const errors: string[] = [];

    // Validate that ids is an array
    if (!Array.isArray(ids)) {
      errors.push('ids must be an array');
      return { isValid: false, errors, sanitizedIds: [] };
    }

    // Validate array is not empty
    if (ids.length === 0) {
      errors.push('ids array cannot be empty');
      return { isValid: false, errors, sanitizedIds: [] };
    }

    // Validate array size
    if (ids.length > this.config.maxItems) {
      errors.push(
        `Too many items: ${ids.length}. Maximum allowed: ${this.config.maxItems}`
      );
      return { isValid: false, errors, sanitizedIds: [] };
    }

    // Validate and sanitize individual IDs
    const sanitizedIds: string[] = [];
    const seenIds = new Set<string>();

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];

      // Validate ID is a string
      if (typeof id !== 'string') {
        errors.push(`Item at index ${i} must be a string, got ${typeof id}`);
        continue;
      }

      // Validate ID is not empty
      const trimmedId = id.trim();
      if (trimmedId.length === 0) {
        errors.push(`Item at index ${i} cannot be empty`);
        continue;
      }

      // Check for duplicates
      if (seenIds.has(trimmedId)) {
        errors.push(`Duplicate ID found: ${trimmedId}`);
        continue;
      }

      seenIds.add(trimmedId);
      sanitizedIds.push(trimmedId);
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedIds,
    };
  }

  /**
   * Execute a bulk operation on multiple items
   */
  async executeBulkOperation<T = any>(
    ids: string[],
    operation: BulkOperationFunction<T>,
    firewalla: FirewallaClient,
    operationName: string
  ): Promise<BulkOperationResult> {
    const startTime = Date.now();
    const results: BulkOperationItemResult[] = [];
    const errorsByType: Record<string, number> = {};
    const warnings: string[] = [];

    try {
      // Process items with controlled concurrency
      const chunks = this.chunkArray(ids, this.config.concurrency);

      for (const chunk of chunks) {
        const chunkPromises = chunk.map(async (id, index) => {
          try {
            const result = await withToolTimeout(
              async () => operation(id, firewalla, index),
              `bulk_${operationName}`,
              this.config.timeoutMs / ids.length // Distribute timeout across items
            );

            return {
              id,
              success: true,
              data: result,
            } as BulkOperationItemResult;
          } catch (error) {
            let errorMessage = 'Unknown error occurred';
            let errorType = 'unknown_error';

            if (error instanceof TimeoutError) {
              errorMessage = `Operation timed out for item ${id}`;
              errorType = 'timeout_error';
            } else if (error instanceof Error) {
              errorMessage = error.message;
              // Try to determine error type from message
              if (
                errorMessage.includes('not found') ||
                errorMessage.includes('404')
              ) {
                errorType = 'not_found_error';
              } else if (
                errorMessage.includes('unauthorized') ||
                errorMessage.includes('403')
              ) {
                errorType = 'authentication_error';
              } else if (
                errorMessage.includes('network') ||
                errorMessage.includes('connection')
              ) {
                errorType = 'network_error';
              } else {
                errorType = 'api_error';
              }
            }

            // Track error types
            errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;

            const itemResult: BulkOperationItemResult = {
              id,
              success: false,
              error: errorMessage,
              errorType,
            };

            if (this.config.collectDetailedErrors) {
              itemResult.data = {
                originalError:
                  error instanceof Error ? error.message : String(error),
                timestamp: new Date().toISOString(),
              };
            }

            return itemResult;
          }
        });

        // Wait for current chunk to complete
        const chunkResults = await Promise.all(chunkPromises);
        results.push(...chunkResults);

        // If not continuing on failure and we have failures, stop
        if (
          !this.config.continueOnFailure &&
          chunkResults.some(r => !r.success)
        ) {
          warnings.push(
            'Operation stopped due to failures (continueOnFailure=false)'
          );
          break;
        }
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const processingTime = Date.now() - startTime;

      // Add performance warnings
      if (processingTime > this.config.timeoutMs * 0.8) {
        warnings.push(
          'Operation took longer than expected, consider reducing batch size'
        );
      }

      if (failed > successful) {
        warnings.push(
          'More operations failed than succeeded, check your input data and permissions'
        );
      }

      return {
        total: results.length,
        successful,
        failed,
        results,
        summary: {
          success_rate: results.length > 0 ? successful / results.length : 0,
          processing_time_ms: processingTime,
          errors_by_type: errorsByType,
        },
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      // Handle catastrophic failures
      const errorMessage = `Bulk operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      throw new Error(errorMessage);
    }
  }

  /**
   * Split array into chunks for controlled concurrency
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Create a configuration optimized for alarm operations
   */
  static forAlarms(): BulkOperationManager {
    return new BulkOperationManager({
      maxItems: 50, // Alarms are typically smaller operations
      continueOnFailure: true,
      timeoutMs: 20000,
      concurrency: 3,
      collectDetailedErrors: true,
    });
  }

  /**
   * Create a configuration optimized for rule operations
   */
  static forRules(): BulkOperationManager {
    return new BulkOperationManager({
      maxItems: 100, // Rules can handle larger batches
      continueOnFailure: true,
      timeoutMs: 45000,
      concurrency: 5,
      collectDetailedErrors: true,
    });
  }

  /**
   * Create a configuration optimized for device operations
   */
  static forDevices(): BulkOperationManager {
    return new BulkOperationManager({
      maxItems: 200, // Device operations are usually lightweight
      continueOnFailure: true,
      timeoutMs: 30000,
      concurrency: 10,
      collectDetailedErrors: false, // Don't need detailed errors for device ops
    });
  }
}

/**
 * Utility function to create standardized bulk operation responses
 */
export function createBulkOperationResponse(
  result: BulkOperationResult,
  operationName: string
) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            operation: operationName,
            ...result,
            timestamp: new Date().toISOString(),
          },
          null,
          2
        ),
      },
    ],
    isError: false,
  };
}

/**
 * Validate common bulk operation parameters
 */
export function validateBulkOperationArgs(args: any): {
  isValid: boolean;
  errors: string[];
  sanitizedArgs: {
    ids: string[];
    options?: any;
  };
} {
  const errors: string[] = [];

  // Validate required ids parameter
  const idsValidation = ParameterValidator.validateRequiredString(
    Array.isArray(args?.ids) ? JSON.stringify(args.ids) : args?.ids,
    'ids'
  );

  if (!idsValidation.isValid) {
    // Special handling for array validation
    if (!Array.isArray(args?.ids)) {
      errors.push('ids parameter must be an array of strings');
    } else {
      errors.push(...idsValidation.errors);
    }
  }

  const ids = Array.isArray(args?.ids) ? args.ids : [];

  // Additional validation for individual IDs
  const validIds: string[] = [];
  ids.forEach((id: any, index: number) => {
    if (typeof id !== 'string') {
      errors.push(`ID at index ${index} must be a string, got ${typeof id}`);
    } else if (id.trim().length === 0) {
      errors.push(`ID at index ${index} cannot be empty`);
    } else {
      validIds.push(id.trim());
    }
  });

  return {
    isValid: errors.length === 0,
    errors,
    sanitizedArgs: {
      ids: validIds,
      options: args?.options || {},
    },
  };
}
