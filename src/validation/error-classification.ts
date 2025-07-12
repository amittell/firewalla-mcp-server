/**
 * Error Classification and Standardization Utilities for Firewalla MCP Server
 * Provides consistent error classification, response formatting, and troubleshooting guidance
 */

import { ErrorType, createErrorResponse } from './error-handler.js';

/**
 * Common error patterns and their classifications
 */
export const ERROR_PATTERNS = {
  // Network and connectivity errors
  NETWORK_ERRORS: [
    /ECONNREFUSED/i,
    /ENOTFOUND/i,
    /ETIMEDOUT/i,
    /network.*error/i,
    /connection.*refused/i,
    /connection.*reset/i,
    /dns.*error/i,
  ],

  // Authentication and authorization errors
  AUTH_ERRORS: [
    /unauthorized/i,
    /authentication.*failed/i,
    /invalid.*token/i,
    /access.*denied/i,
    /forbidden/i,
    /401/,
    /403/,
  ],

  // Resource not found errors
  NOT_FOUND_ERRORS: [
    /not.*found/i,
    /does.*not.*exist/i,
    /resource.*not.*found/i,
    /404/,
    /no.*such.*resource/i,
  ],

  // Rate limiting errors
  RATE_LIMIT_ERRORS: [
    /rate.*limit/i,
    /too.*many.*requests/i,
    /429/,
    /quota.*exceeded/i,
    /throttle/i,
  ],

  // Timeout errors (actual timeouts, not misclassified)
  TIMEOUT_ERRORS: [
    /timeout/i,
    /timed.*out/i,
    /operation.*timeout/i,
    /request.*timeout/i,
  ],

  // Validation errors
  VALIDATION_ERRORS: [
    /validation.*failed/i,
    /invalid.*parameter/i,
    /parameter.*required/i,
    /missing.*parameter/i,
    /bad.*request/i,
    /400/,
  ],

  // Cache-related errors
  CACHE_ERRORS: [
    /cache.*error/i,
    /cache.*miss/i,
    /cache.*timeout/i,
    /redis.*error/i,
    /memcached.*error/i,
  ],

  // Correlation errors
  CORRELATION_ERRORS: [
    /correlation.*failed/i,
    /cross.*reference.*failed/i,
    /mapping.*error/i,
  ],

  // Search-specific errors
  SEARCH_ERRORS: [
    /search.*failed/i,
    /query.*failed/i,
    /index.*error/i,
    /search.*timeout/i,
    /query.*syntax.*error/i,
    /invalid.*search.*field/i,
    /search.*limit.*exceeded/i,
  ],
} as const;

/**
 * Error context information for better troubleshooting
 */
export interface ErrorContext {
  /** Tool name where error occurred */
  toolName: string;
  /** Operation being performed */
  operation?: string;
  /** Parameters passed to the operation */
  parameters?: Record<string, unknown>;
  /** Original error object */
  originalError?: Error;
  /** Additional context information */
  context?: Record<string, unknown>;
}

/**
 * Standardized troubleshooting suggestions by error type
 */
export const TROUBLESHOOTING_GUIDES = {
  [ErrorType.VALIDATION_ERROR]: [
    'Check that all required parameters are provided',
    'Verify parameter types and formats match expectations',
    'Review parameter value ranges and constraints',
    'Ensure special characters are properly escaped',
  ],
  
  [ErrorType.AUTHENTICATION_ERROR]: [
    'Verify your API token is valid and not expired',
    'Check that the token has necessary permissions',
    'Ensure the MSP domain is correct',
    'Try regenerating your access token',
  ],
  
  [ErrorType.API_ERROR]: [
    'Check if the Firewalla API is accessible',
    'Verify network connectivity to the MSP endpoint',
    'Ensure the resource exists and is accessible',
    'Check for API service outages or maintenance',
  ],
  
  [ErrorType.NETWORK_ERROR]: [
    'Verify internet connectivity',
    'Check firewall and proxy settings',
    'Ensure DNS resolution is working',
    'Try again after a brief delay',
  ],
  
  [ErrorType.TIMEOUT_ERROR]: [
    'Reduce the scope of your query (smaller limit, shorter time range)',
    'Try breaking large operations into smaller chunks',
    'Check for network latency issues',
    'Consider using pagination for large datasets',
  ],
  
  [ErrorType.RATE_LIMIT_ERROR]: [
    'Implement delays between API calls',
    'Reduce the frequency of requests',
    'Use caching to minimize duplicate requests',
    'Contact support if limits seem unreasonable',
  ],
  
  [ErrorType.CACHE_ERROR]: [
    'Clear local cache and retry',
    'Check cache service availability',
    'Try disabling cache temporarily',
    'Verify cache configuration settings',
  ],
  
  [ErrorType.CORRELATION_ERROR]: [
    'Simplify correlation queries',
    'Check field names and availability',
    'Reduce the number of correlation fields',
    'Verify data types match for correlation',
  ],
  
  [ErrorType.SEARCH_ERROR]: [
    'Verify search query syntax',
    'Check field names and operators',
    'Simplify complex search expressions',
    'Try using exact matches instead of wildcards',
  ],
  
  [ErrorType.SERVICE_UNAVAILABLE]: [
    'Check if the MCP server is running in safe mode',
    'Verify the WAVE0_ENABLED environment variable is not set to false',
    'Wait for service maintenance to complete',
    'Try again after a short delay',
  ],
  
  [ErrorType.TOOL_DISABLED]: [
    'Check if the tool is listed in MCP_DISABLED_TOOLS environment variable',
    'Verify the tool name is spelled correctly',
    'Contact administrator to enable the tool',
    'Use alternative tools if available',
  ],
  
  [ErrorType.UNKNOWN_ERROR]: [
    'Check the detailed error message for clues',
    'Try the operation again after a short delay',
    'Verify all parameters are correct',
    'Contact support if the issue persists',
  ],
} as const;

/**
 * Documentation links by error type
 */
export const DOCUMENTATION_LINKS = {
  [ErrorType.VALIDATION_ERROR]: '/docs/parameter-validation-guide.md',
  [ErrorType.AUTHENTICATION_ERROR]: '/docs/authentication-guide.md',
  [ErrorType.API_ERROR]: '/docs/firewalla-api-reference.md',
  [ErrorType.NETWORK_ERROR]: '/docs/troubleshooting-guide.md#network-issues',
  [ErrorType.TIMEOUT_ERROR]: '/docs/performance-optimization-guide.md',
  [ErrorType.RATE_LIMIT_ERROR]: '/docs/rate-limiting-guide.md',
  [ErrorType.CACHE_ERROR]: '/docs/caching-guide.md',
  [ErrorType.CORRELATION_ERROR]: '/docs/correlation-guide.md',
  [ErrorType.SEARCH_ERROR]: '/docs/query-syntax-guide.md',
  [ErrorType.SERVICE_UNAVAILABLE]: '/docs/troubleshooting-guide.md',
  [ErrorType.TOOL_DISABLED]: '/docs/feature-flags-guide.md',
  [ErrorType.UNKNOWN_ERROR]: '/docs/troubleshooting-guide.md',
} as const;

/**
 * Error classification utility
 */
export class ErrorClassifier {
  /**
   * Classify an error based on its message and context with improved timeout detection
   */
  static classifyError(error: Error | string, context?: ErrorContext): ErrorType {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorString = errorMessage.toLowerCase();

    // First, check for likely misclassified timeouts
    if (errorString.includes('timeout')) {
      const executionTime = context?.context?.executionTime as number | undefined;
      if (this.isLikelyMisclassifiedTimeout(error, executionTime)) {
        // This looks like a validation or other error that mentions timeout
        // Check for validation patterns specifically
        if (ERROR_PATTERNS.VALIDATION_ERRORS.some(pattern => pattern.test(errorString))) {
          return ErrorType.VALIDATION_ERROR;
        }
        if (ERROR_PATTERNS.AUTH_ERRORS.some(pattern => pattern.test(errorString))) {
          return ErrorType.AUTHENTICATION_ERROR;
        }
        if (ERROR_PATTERNS.NETWORK_ERRORS.some(pattern => pattern.test(errorString))) {
          return ErrorType.NETWORK_ERROR;
        }
      } else {
        // This appears to be a real timeout
        return ErrorType.TIMEOUT_ERROR;
      }
    }

    // Priority-based classification to handle pattern conflicts
    // Higher priority error types are checked first
    
    // 1. Authentication errors (highest priority - security critical)
    if (ERROR_PATTERNS.AUTH_ERRORS.some(pattern => pattern.test(errorString))) {
      return ErrorType.AUTHENTICATION_ERROR;
    }

    // 2. Validation errors (high priority - parameter issues)
    if (ERROR_PATTERNS.VALIDATION_ERRORS.some(pattern => pattern.test(errorString))) {
      return ErrorType.VALIDATION_ERROR;
    }

    // 3. Rate limiting errors (high priority - service protection)
    if (ERROR_PATTERNS.RATE_LIMIT_ERRORS.some(pattern => pattern.test(errorString))) {
      return ErrorType.RATE_LIMIT_ERROR;
    }

    // 4. Network errors (medium priority - infrastructure issues)
    if (ERROR_PATTERNS.NETWORK_ERRORS.some(pattern => pattern.test(errorString))) {
      return ErrorType.NETWORK_ERROR;
    }

    // 5. Timeout errors (only real timeouts reach here)
    if (ERROR_PATTERNS.TIMEOUT_ERRORS.some(pattern => pattern.test(errorString))) {
      return ErrorType.TIMEOUT_ERROR;
    }

    // 6. Cache errors (medium priority)
    if (ERROR_PATTERNS.CACHE_ERRORS.some(pattern => pattern.test(errorString))) {
      return ErrorType.CACHE_ERROR;
    }

    // 7. Search-specific errors
    if (ERROR_PATTERNS.SEARCH_ERRORS.some(pattern => pattern.test(errorString))) {
      return ErrorType.SEARCH_ERROR;
    }

    // 8. Correlation errors
    if (ERROR_PATTERNS.CORRELATION_ERRORS.some(pattern => pattern.test(errorString))) {
      return ErrorType.CORRELATION_ERROR;
    }

    // 9. API errors (including not found - lower priority as these are more generic)
    if (ERROR_PATTERNS.NOT_FOUND_ERRORS.some(pattern => pattern.test(errorString))) {
      return ErrorType.API_ERROR;
    }

    // Context-based classification for edge cases
    if (context?.operation?.includes('search') || context?.operation?.includes('query')) {
      return ErrorType.SEARCH_ERROR;
    }

    if (context?.operation?.includes('auth') || context?.operation?.includes('login')) {
      return ErrorType.AUTHENTICATION_ERROR;
    }

    if (context?.parameters && Object.keys(context.parameters).length > 0) {
      // If we have parameters but no clear pattern match, likely a validation issue
      return ErrorType.VALIDATION_ERROR;
    }

    return ErrorType.UNKNOWN_ERROR;
  }

  /**
   * Create a standardized error response with proper classification
   */
  static createStandardizedErrorResponse(
    error: Error | string,
    context: ErrorContext
  ) {
    const errorType = this.classifyError(error, context);
    const errorMessage = typeof error === 'string' ? error : error.message;
    
    // Create enhanced error details
    const errorDetails = {
      tool: context.toolName,
      operation: context.operation,
      error_type: errorType,
      original_error: errorMessage,
      timestamp: new Date().toISOString(),
      parameters: context.parameters,
      context: context.context,
      troubleshooting: TROUBLESHOOTING_GUIDES[errorType],
      documentation: DOCUMENTATION_LINKS[errorType],
    };

    // Generate user-friendly error message
    const userMessage = this.generateUserFriendlyMessage(errorType, errorMessage, context);

    return createErrorResponse(
      context.toolName,
      userMessage,
      errorType,
      errorDetails,
      undefined, // validation_errors - will be set separately if needed
      {
        endpoint: context.operation,
        parameters: context.parameters,
        userAgent: 'Firewalla MCP Server',
      }
    );
  }

  /**
   * Generate user-friendly error messages
   */
  private static generateUserFriendlyMessage(
    errorType: ErrorType,
    originalMessage: string,
    context: ErrorContext
  ): string {
    const operation = context.operation || 'operation';
    
    switch (errorType) {
      case ErrorType.VALIDATION_ERROR:
        return `Parameter validation failed for ${operation}`;
      
      case ErrorType.AUTHENTICATION_ERROR:
        return `Authentication failed - please check your API credentials`;
      
      case ErrorType.NETWORK_ERROR:
        return `Network error occurred while performing ${operation}`;
      
      case ErrorType.TIMEOUT_ERROR:
        return `Operation ${operation} timed out - try reducing query scope`;
      
      case ErrorType.RATE_LIMIT_ERROR:
        return `Rate limit exceeded - please slow down your requests`;
      
      case ErrorType.API_ERROR:
        if (originalMessage.includes('not found') || originalMessage.includes('404')) {
          return `Resource not found for ${operation}`;
        }
        return `API error occurred during ${operation}`;
      
      case ErrorType.CACHE_ERROR:
        return `Cache error during ${operation} - operation may be slower`;
      
      case ErrorType.CORRELATION_ERROR:
        return `Correlation analysis failed - try simplifying the query`;
      
      case ErrorType.SEARCH_ERROR:
        return `Search operation failed - check query syntax`;
      
      case ErrorType.SERVICE_UNAVAILABLE:
        return `Service is temporarily unavailable for ${operation}`;
      
      case ErrorType.TOOL_DISABLED:
        return `Tool is currently disabled for ${operation}`;
      
      case ErrorType.UNKNOWN_ERROR:
        return `Unknown error occurred during ${operation}: ${originalMessage}`;
      
      default:
        return `${operation} failed: ${originalMessage}`;
    }
  }

  /**
   * Enhance existing error responses with standardized classification
   */
  static enhanceErrorResponse(
    existingResponse: any,
    error: Error | string,
    context: ErrorContext
  ): any {
    const errorType = this.classifyError(error, context);
    
    if (existingResponse.content?.[0]?.text) {
      try {
        const errorData = JSON.parse(existingResponse.content[0].text);
        
        // Enhance with standardized information
        errorData.errorType = errorType;
        errorData.troubleshooting = TROUBLESHOOTING_GUIDES[errorType];
        errorData.documentation = DOCUMENTATION_LINKS[errorType];
        errorData.classification = {
          auto_classified: true,
          confidence: 'high',
          pattern_matched: true,
        };
        
        existingResponse.content[0].text = JSON.stringify(errorData, null, 2);
      } catch {
        // If parsing fails, leave response as-is
      }
    }
    
    return existingResponse;
  }

  /**
   * Check if an error is likely a timeout that should be reclassified
   */
  static isLikelyMisclassifiedTimeout(
    error: Error | string,
    duration?: number
  ): boolean {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorString = errorMessage.toLowerCase();
    
    // If duration is very short (< 100ms) but error mentions timeout,
    // it's likely a misclassification
    if (duration && duration < 100 && errorString.includes('timeout')) {
      return true;
    }
    
    // If duration is very long (> 30s), it's probably a real timeout
    if (duration && duration > 30000) {
      return false;
    }
    
    // Check for patterns that suggest immediate failure rather than actual timeout
    const immediateFailurePatterns = [
      /connection.*refused/i,
      /not.*found/i,
      /invalid.*parameter/i,
      /parameter.*required/i,
      /missing.*parameter/i,
      /authentication.*failed/i,
      /unauthorized/i,
      /forbidden/i,
      /bad.*request/i,
      /validation.*failed/i,
      /syntax.*error/i,
      /parse.*error/i,
      /format.*error/i,
      /400/,
      /401/,
      /403/,
      /404/,
    ];
    
    // If it contains timeout but also contains immediate failure patterns, 
    // it's likely misclassified
    if (errorString.includes('timeout') && 
        immediateFailurePatterns.some(pattern => pattern.test(errorString))) {
      return true;
    }
    
    // Check for specific timeout error contexts that suggest real timeouts
    const realTimeoutIndicators = [
      /operation.*timeout/i,
      /request.*timeout/i,
      /socket.*timeout/i,
      /connection.*timeout/i,
      /read.*timeout/i,
      /write.*timeout/i,
      /execution.*timeout/i,
    ];
    
    // If it contains timeout and specific timeout indicators, it's probably real
    if (errorString.includes('timeout') && 
        realTimeoutIndicators.some(pattern => pattern.test(errorString))) {
      return false;
    }
    
    return false;
  }

  /**
   * Get error statistics for monitoring
   */
  static getErrorStats(): {
    classifications: Record<string, number>;
    commonPatterns: Array<{ pattern: string; count: number }>;
  } {
    // This would be implemented with actual error tracking
    // For now, return empty stats
    return {
      classifications: {},
      commonPatterns: [],
    };
  }
}

/**
 * Convenience function for creating standardized error responses
 */
export function createStandardizedError(
  error: Error | string,
  toolName: string,
  operation?: string,
  parameters?: Record<string, unknown>
) {
  return ErrorClassifier.createStandardizedErrorResponse(error, {
    toolName,
    operation,
    parameters,
    originalError: typeof error === 'string' ? new Error(error) : error,
  });
}

/**
 * Convenience function for enhancing existing error responses
 */
export function enhanceExistingError(
  existingResponse: any,
  error: Error | string,
  toolName: string,
  operation?: string
) {
  return ErrorClassifier.enhanceErrorResponse(existingResponse, error, {
    toolName,
    operation,
    originalError: typeof error === 'string' ? new Error(error) : error,
  });
}