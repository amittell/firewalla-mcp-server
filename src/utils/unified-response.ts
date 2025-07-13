/**
 * Unified Response Format for Solo Dev OSS Project
 *
 * Simple, consistent response format for all MCP tools.
 * Focuses on practicality and maintainability over enterprise complexity.
 */

import type { ToolResponse } from '../tools/handlers/base.js';

/**
 * Simple unified response interface
 */
export interface UnifiedResponse<T = any> {
  /** Whether the operation was successful */
  success: boolean;

  /** The actual data payload */
  data?: T;

  /** Error message if success is false */
  error?: string;

  /** Basic metadata */
  meta: {
    /** Timestamp when response was generated */
    timestamp: string;

    /** Tool that generated this response */
    tool: string;

    /** Simple request identifier */
    request_id: string;

    /** Number of results returned (for arrays) */
    count?: number;

    /** Execution time in milliseconds */
    execution_time_ms?: number;
  };
}

/**
 * Create a successful unified response
 */
export function createSuccessResponse<T>(
  data: T,
  toolName: string,
  options: {
    executionTimeMs?: number;
    requestId?: string;
  } = {}
): UnifiedResponse<T> {
  const count = Array.isArray(data) ? data.length : undefined;

  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      tool: toolName,
      request_id: options.requestId || generateRequestId(),
      count,
      execution_time_ms: options.executionTimeMs,
    },
  };
}

/**
 * Create an error unified response
 */
export function createErrorResponse(
  error: string,
  toolName: string,
  options: {
    requestId?: string;
  } = {}
): UnifiedResponse<never> {
  return {
    success: false,
    error,
    meta: {
      timestamp: new Date().toISOString(),
      tool: toolName,
      request_id: options.requestId || generateRequestId(),
    },
  };
}

/**
 * Convert unified response to MCP ToolResponse format
 */
export function toToolResponse(unifiedResponse: UnifiedResponse): ToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(unifiedResponse, null, 2),
      },
    ],
    isError: !unifiedResponse.success,
  };
}

/**
 * Simple wrapper to convert any tool handler to use unified responses
 */
export function withUnifiedResponse<
  T extends (...args: any[]) => Promise<ToolResponse>,
>(handler: T, toolName: string): T {
  return (async (...args: Parameters<T>) => {
    const startTime = Date.now();
    const requestId = generateRequestId();

    try {
      const result = await handler(...args);

      // If it's already an error, convert to unified error format
      if (result.isError) {
        const errorText = result.content[0]?.text || 'Unknown error';
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        const unifiedError = createErrorResponse(
          errorData.message || errorData.error || 'Unknown error',
          toolName,
          { requestId }
        );

        return toToolResponse(unifiedError);
      }

      // Convert successful response to unified format
      let data;
      try {
        data = JSON.parse(result.content[0]?.text || '{}');
      } catch {
        data = result.content[0]?.text || {};
      }

      const executionTimeMs = Date.now() - startTime;
      const unifiedSuccess = createSuccessResponse(data, toolName, {
        executionTimeMs,
        requestId,
      });

      return toToolResponse(unifiedSuccess);
    } catch (error) {
      const unifiedError = createErrorResponse(
        error instanceof Error ? error.message : 'Unknown error',
        toolName,
        { requestId }
      );

      return toToolResponse(unifiedError);
    }
  }) as T;
}

/**
 * Generate a simple request ID
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Type guard to check if a response is a unified response
 */
export function isUnifiedResponse(obj: any): obj is UnifiedResponse {
  if (!obj || typeof obj !== 'object' || typeof obj.success !== 'boolean') {
    return false;
  }

  if (!obj.meta || typeof obj.meta !== 'object') {
    return false;
  }

  return (
    typeof obj.meta.timestamp === 'string' &&
    typeof obj.meta.tool === 'string' &&
    typeof obj.meta.request_id === 'string'
  );
}
