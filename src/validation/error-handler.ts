/**
 * Centralized Error Handling and Validation for Firewalla MCP Server
 * Provides consistent error responses and comprehensive validation utilities
 */

import { FieldValidator } from './field-validator.js';

/**
 * Interface for validatable objects
 */
export type ValidatableValue = Record<string, unknown>;

/**
 * Enumeration of specific error types for better error categorization
 */
export enum ErrorType {
  VALIDATION_ERROR = 'validation_error',
  AUTHENTICATION_ERROR = 'authentication_error',
  API_ERROR = 'api_error',
  NETWORK_ERROR = 'network_error',
  TIMEOUT_ERROR = 'timeout_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  CACHE_ERROR = 'cache_error',
  CORRELATION_ERROR = 'correlation_error',
  SEARCH_ERROR = 'search_error',
  UNKNOWN_ERROR = 'unknown_error'
}

/**
 * Enhanced error interface with specific error types and context
 */
export interface StandardError {
  error: true;
  message: string;
  tool: string;
  errorType: ErrorType;
  details?: Record<string, unknown>;
  validation_errors?: string[];
  timestamp?: string;
  context?: {
    endpoint?: string;
    parameters?: Record<string, unknown>;
    userAgent?: string;
    requestId?: string;
  };
}

/**
 * Legacy StandardError interface for backward compatibility
 * @deprecated Use the enhanced StandardError interface instead
 */
export interface LegacyStandardError {
  error: true;
  message: string;
  tool: string;
  details?: Record<string, unknown>;
  validation_errors?: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedValue?: unknown;
}

/**
 * Create a standard error response with enhanced error typing
 * 
 * @param tool - The name of the tool that generated the error
 * @param message - The error message
 * @param errorType - The specific type of error (defaults to UNKNOWN_ERROR)
 * @param details - Optional additional error details
 * @param validationErrors - Optional array of validation error messages
 * @param context - Optional context information about the error
 * @returns Formatted error response for MCP protocol
 */
export function createErrorResponse(
  tool: string,
  message: string,
  errorType: ErrorType = ErrorType.UNKNOWN_ERROR,
  details?: Record<string, unknown>,
  validationErrors?: string[],
  context?: StandardError['context']
): {
  content: Array<{ type: string; text: string }>;
  isError: true;
} {
  const errorResponse: StandardError = {
    error: true,
    message,
    tool,
    errorType,
    timestamp: new Date().toISOString(),
    ...(details && { details }),
    ...(validationErrors?.length && { validation_errors: validationErrors }),
    ...(context && { context })
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(errorResponse, null, 2),
      },
    ],
    isError: true,
  };
}

/**
 * Create a legacy error response for backward compatibility
 * @deprecated Use createErrorResponse with ErrorType instead
 */
export function createLegacyErrorResponse(tool: string, message: string, details?: Record<string, unknown>, validationErrors?: string[]): {
  content: Array<{ type: string; text: string }>;
  isError: true;
} {
  return createErrorResponse(tool, message, ErrorType.UNKNOWN_ERROR, details, validationErrors);
}

/**
 * Wrap a function to ensure consistent error handling
 */
export function wrapTool<T extends unknown[], R>(
  toolName: string,
   
  fn: (..._args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw createErrorResponse(toolName, errorMessage);
    }
  };
}

/**
 * Parameter validation utilities
 */
export class ParameterValidator {
  /**
   * Validate required string parameter with enhanced null safety
   */
  static validateRequiredString(value: unknown, paramName: string): ValidationResult {
    // Enhanced null/undefined handling with consistent normalization
    if (value === undefined || value === null) {
      return {
        isValid: false,
        errors: [`${paramName} is required`]
      };
    }

    // Enhanced type checking to prevent Object conversion errors
    if (typeof value !== 'string') {
      // Provide specific error messages for different types
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          return {
            isValid: false,
            errors: [`${paramName} must be a string, got array`]
          };
        }
        return {
          isValid: false,
          errors: [`${paramName} must be a string, got ${Object.prototype.toString.call(value)}`]
        };
      }
      return {
        isValid: false,
        errors: [`${paramName} must be a string, got ${typeof value}`]
      };
    }

    // Enhanced string validation with null safety
    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
      return {
        isValid: false,
        errors: [`${paramName} cannot be empty`]
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: trimmedValue
    };
  }

  /**
   * Validate optional string parameter with enhanced null safety
   */
  static validateOptionalString(value: unknown, paramName: string): ValidationResult {
    // Enhanced null/undefined handling with consistent normalization
    if (value === undefined || value === null) {
      return {
        isValid: true,
        errors: [],
        sanitizedValue: undefined
      };
    }

    // Enhanced type checking to prevent Object conversion errors
    if (typeof value !== 'string') {
      // Provide specific error messages for different types
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          return {
            isValid: false,
            errors: [`${paramName} must be a string if provided, got array`]
          };
        }
        return {
          isValid: false,
          errors: [`${paramName} must be a string if provided, got ${Object.prototype.toString.call(value)}`]
        };
      }
      return {
        isValid: false,
        errors: [`${paramName} must be a string if provided, got ${typeof value}`]
      };
    }

    // Enhanced string processing with null safety
    const trimmedValue = value.trim();
    
    // For optional strings, empty values are converted to undefined
    if (trimmedValue.length === 0) {
      return {
        isValid: true,
        errors: [],
        sanitizedValue: undefined
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: trimmedValue
    };
  }

  /**
   * Validate numeric parameter with range checking
   */
  static validateNumber(
    value: unknown, 
    paramName: string, 
    options: {
      required?: boolean;
      min?: number;
      max?: number;
      defaultValue?: number;
      integer?: boolean;
    } = {}
  ): ValidationResult {
    const { required = false, min, max, defaultValue, integer = false } = options;

    // Enhanced null/undefined handling with consistent normalization
    if (value === undefined || value === null) {
      if (required) {
        return {
          isValid: false,
          errors: [`${paramName} is required`]
        };
      }
      
      // Validate default value against constraints if provided
      if (defaultValue !== undefined) {
        // Enhanced default value validation with null safety
        if (typeof defaultValue !== 'number' || !Number.isFinite(defaultValue)) {
          return {
            isValid: false,
            errors: [`${paramName} default value must be a finite number`]
          };
        }
        if (min !== undefined && defaultValue < min) {
          return {
            isValid: false,
            errors: [`${paramName} default value ${defaultValue} must be at least ${min}`]
          };
        }
        if (max !== undefined && defaultValue > max) {
          return {
            isValid: false,
            errors: [`${paramName} default value ${defaultValue} must be at most ${max}`]
          };
        }
        if (integer && !Number.isInteger(defaultValue)) {
          return {
            isValid: false,
            errors: [`${paramName} default value ${defaultValue} must be an integer`]
          };
        }
      }
      
      return {
        isValid: true,
        errors: [],
        sanitizedValue: defaultValue
      };
    }

    // Enhanced type checking to prevent Object conversion errors
    let numValue: number;
    
    // Prevent Object conversion errors by checking type before Number() conversion
    if (typeof value === 'object' && value !== null) {
      // Handle objects, arrays, and other non-primitive types
      if (Array.isArray(value)) {
        return {
          isValid: false,
          errors: [`${paramName} must be a number, got array`]
        };
      }
      return {
        isValid: false,
        errors: [`${paramName} must be a number, got ${Object.prototype.toString.call(value)}`]
      };
    }
    
    // Safely convert to number with enhanced validation
    if (typeof value === 'string') {
      // Handle empty strings explicitly
      if (value.trim() === '') {
        return {
          isValid: false,
          errors: [`${paramName} cannot be empty string`]
        };
      }
      numValue = Number(value);
    } else if (typeof value === 'boolean') {
      // Explicitly reject boolean values to prevent implicit conversion
      return {
        isValid: false,
        errors: [`${paramName} must be a number, got boolean`]
      };
    } else if (typeof value === 'number') {
      numValue = value;
    } else {
      // Handle other types (function, symbol, etc.)
      return {
        isValid: false,
        errors: [`${paramName} must be a number, got ${typeof value}`]
      };
    }

    // Enhanced NaN and Infinity checking
    if (!Number.isFinite(numValue)) {
      if (isNaN(numValue)) {
        return {
          isValid: false,
          errors: [`${paramName} must be a valid number`]
        };
      }
      if (numValue === Infinity || numValue === -Infinity) {
        return {
          isValid: false,
          errors: [`${paramName} cannot be infinite`]
        };
      }
    }

    if (integer && !Number.isInteger(numValue)) {
      return {
        isValid: false,
        errors: [`${paramName} must be an integer`]
      };
    }

    if (min !== undefined && numValue < min) {
      const contextualMessage = ParameterValidator.getContextualBoundaryMessage(paramName, numValue, min, max, 'minimum');
      return {
        isValid: false,
        errors: [contextualMessage]
      };
    }

    if (max !== undefined && numValue > max) {
      const contextualMessage = ParameterValidator.getContextualBoundaryMessage(paramName, numValue, min, max, 'maximum');
      return {
        isValid: false,
        errors: [contextualMessage]
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: numValue
    };
  }

  /**
   * Validate enum parameter with enhanced null safety
   */
  static validateEnum(
    value: unknown,
    paramName: string,
    allowedValues: string[],
    required = false,
    defaultValue?: string
  ): ValidationResult {
    // Enhanced null/undefined handling with consistent normalization
    if (value === undefined || value === null) {
      if (required) {
        return {
          isValid: false,
          errors: [`${paramName} is required`]
        };
      }
      return {
        isValid: true,
        errors: [],
        sanitizedValue: defaultValue
      };
    }

    // Enhanced type checking to prevent Object conversion errors
    if (typeof value !== 'string') {
      if (typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          return {
            isValid: false,
            errors: [`${paramName} must be a string, got array`]
          };
        }
        return {
          isValid: false,
          errors: [`${paramName} must be a string, got ${Object.prototype.toString.call(value)}`]
        };
      }
      return {
        isValid: false,
        errors: [`${paramName} must be a string, got ${typeof value}`]
      };
    }

    // Enhanced string processing with validation
    const trimmedValue = value.trim();
    
    // Handle empty strings for enums
    if (trimmedValue === '') {
      if (required) {
        return {
          isValid: false,
          errors: [`${paramName} cannot be empty`]
        };
      }
      return {
        isValid: true,
        errors: [],
        sanitizedValue: defaultValue
      };
    }

    // Enhanced enum validation with null safety
    if (!Array.isArray(allowedValues) || allowedValues.length === 0) {
      return {
        isValid: false,
        errors: [`${paramName} has no valid options defined`]
      };
    }

    if (!allowedValues.includes(trimmedValue)) {
      return {
        isValid: false,
        errors: [`${paramName} must be one of: ${allowedValues.join(', ')}, got '${trimmedValue}'`]
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: trimmedValue
    };
  }

  /**
   * Validate boolean parameter with enhanced null safety
   */
  static validateBoolean(
    value: unknown,
    paramName: string,
    defaultValue?: boolean
  ): ValidationResult {
    // Enhanced null/undefined handling with consistent normalization
    if (value === undefined || value === null) {
      return {
        isValid: true,
        errors: [],
        sanitizedValue: defaultValue
      };
    }

    if (typeof value === 'boolean') {
      return {
        isValid: true,
        errors: [],
        sanitizedValue: value
      };
    }

    // Enhanced string validation to prevent Object conversion errors
    if (typeof value === 'string') {
      // Handle empty strings explicitly
      if (value.trim() === '') {
        return {
          isValid: false,
          errors: [`${paramName} cannot be empty string`]
        };
      }
      
      const lowerValue = value.toLowerCase().trim();
      if (lowerValue === 'true' || lowerValue === '1') {
        return {
          isValid: true,
          errors: [],
          sanitizedValue: true
        };
      }
      if (lowerValue === 'false' || lowerValue === '0') {
        return {
          isValid: true,
          errors: [],
          sanitizedValue: false
        };
      }
      
      // Provide helpful error for invalid string values
      return {
        isValid: false,
        errors: [`${paramName} must be 'true', 'false', '1', or '0', got '${value}'`]
      };
    }

    // Enhanced type checking to prevent Object conversion errors
    if (typeof value === 'object' && value !== null) {
      if (Array.isArray(value)) {
        return {
          isValid: false,
          errors: [`${paramName} must be a boolean, got array`]
        };
      }
      return {
        isValid: false,
        errors: [`${paramName} must be a boolean, got ${Object.prototype.toString.call(value)}`]
      };
    }

    // Handle other primitive types explicitly
    return {
      isValid: false,
      errors: [`${paramName} must be a boolean value, got ${typeof value}`]
    };
  }

  /**
   * Combine multiple validation results
   */
  static combineValidationResults(results: ValidationResult[]): ValidationResult {
    const allErrors = results.flatMap(result => result.errors);
    const isValid = allErrors.length === 0;

    return {
      isValid,
      errors: allErrors
    };
  }

  /**
   * Generate contextual error messages for boundary validation failures
   */
  private static getContextualBoundaryMessage(
    paramName: string, 
    value: number, 
    min?: number, 
    max?: number, 
    violationType: 'minimum' | 'maximum' = 'minimum'
  ): string {
    const paramContext = ParameterValidator.getParameterContext(paramName);
    
    if (violationType === 'minimum') {
      if (value <= 0) {
        return `${paramName} must be a positive number${paramContext ? ` ${paramContext}` : ''} (got ${value}, minimum: ${min})`;
      }
      return `${paramName} is too small${paramContext ? ` ${paramContext}` : ''} (got ${value}, minimum: ${min})`;
    } 
      if (max && max > 1000) {
        return `${paramName} exceeds system limits${paramContext ? ` ${paramContext}` : ''} (got ${value}, maximum: ${max} for performance reasons)`;
      }
      return `${paramName} is too large${paramContext ? ` ${paramContext}` : ''} (got ${value}, maximum: ${max})`;
    
  }

  /**
   * Validate date format (ISO 8601) parameter
   */
  static validateDateFormat(value: unknown, paramName: string, required: boolean = false): ValidationResult {
    if (value === undefined || value === null) {
      if (required) {
        return {
          isValid: false,
          errors: [`${paramName} is required`]
        };
      }
      return {
        isValid: true,
        errors: [],
        sanitizedValue: undefined
      };
    }

    if (typeof value !== 'string') {
      return {
        isValid: false,
        errors: [`${paramName} must be a string in ISO 8601 format (e.g., "2024-01-01T00:00:00Z")`]
      };
    }

    const trimmedValue = value.trim();
    if (trimmedValue.length === 0) {
      if (required) {
        return {
          isValid: false,
          errors: [`${paramName} cannot be empty`]
        };
      }
      return {
        isValid: true,
        errors: [],
        sanitizedValue: undefined
      };
    }

    // Validate ISO 8601 date format
    const date = new Date(trimmedValue);
    if (isNaN(date.getTime())) {
      return {
        isValid: false,
        errors: [
          `${paramName} must be a valid ISO 8601 date string`,
          'Examples: "2024-01-01T00:00:00Z", "2024-01-01T12:30:00+05:00"',
          `Received: "${trimmedValue}"`
        ]
      };
    }

    // Additional validation for common date format issues
    if (!trimmedValue.includes('T') && !trimmedValue.includes(' ')) {
      return {
        isValid: false,
        errors: [
          `${paramName} must include time component in ISO 8601 format`,
          'Use format: "YYYY-MM-DDTHH:mm:ssZ" or "YYYY-MM-DD HH:mm:ss"',
          `Received: "${trimmedValue}"`
        ]
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: trimmedValue
    };
  }

  /**
   * Validate Firewalla rule ID format
   */
  static validateRuleId(value: unknown, paramName: string): ValidationResult {
    const stringValidation = this.validateRequiredString(value, paramName);
    if (!stringValidation.isValid) {
      return stringValidation;
    }

    const ruleId = stringValidation.sanitizedValue as string;

    // Firewalla rule IDs are typically UUIDs or alphanumeric strings with specific patterns
    // Common patterns: UUID format, or alphanumeric with specific prefixes
    const validPatterns = [
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, // UUID
      /^rule_[a-zA-Z0-9_-]+$/i, // Rule prefix format
      /^[a-zA-Z0-9_-]{8,64}$/i, // General alphanumeric ID (8-64 chars)
    ];

    const isValidFormat = validPatterns.some(pattern => pattern.test(ruleId));
    
    if (!isValidFormat) {
      return {
        isValid: false,
        errors: [
          `${paramName} must be a valid rule identifier`,
          'Rule IDs should be UUID format or alphanumeric string (8-64 characters)',
          'Examples: "550e8400-e29b-41d4-a716-446655440000", "rule_block_facebook", "abc123def456"',
          `Received: "${ruleId}"`
        ]
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: ruleId
    };
  }

  /**
   * Validate Firewalla alarm ID format
   */
  static validateAlarmId(value: unknown, paramName: string): ValidationResult {
    const stringValidation = this.validateRequiredString(value, paramName);
    if (!stringValidation.isValid) {
      return stringValidation;
    }

    const alarmId = stringValidation.sanitizedValue as string;

    // Firewalla alarm IDs are typically numeric or alphanumeric
    // Common patterns: numeric IDs, prefixed IDs, or alphanumeric strings
    const validPatterns = [
      /^\d+$/i, // Pure numeric (most common for alarms)
      /^alarm_[a-zA-Z0-9_-]+$/i, // Alarm prefix format
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, // UUID
      /^[a-zA-Z0-9_-]{1,64}$/i, // General alphanumeric ID (1-64 chars)
    ];

    const isValidFormat = validPatterns.some(pattern => pattern.test(alarmId));
    
    if (!isValidFormat) {
      return {
        isValid: false,
        errors: [
          `${paramName} must be a valid alarm identifier`,
          'Alarm IDs should be numeric, UUID format, or alphanumeric string (1-64 characters)',
          'Examples: "12345", "alarm_intrusion_001", "550e8400-e29b-41d4-a716-446655440000"',
          `Received: "${alarmId}"`
        ]
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: alarmId
    };
  }

  /**
   * Validate pagination cursor format using enhanced cursor validator
   */
  static validateCursor(value: unknown, paramName: string): ValidationResult {
    // Enhanced cursor validation to match test expectations
    if (value === null || value === undefined) {
      return { isValid: true, sanitizedValue: undefined, errors: [] };
    }
    
    if (typeof value !== 'string') {
      return {
        isValid: false,
        sanitizedValue: value,
        errors: [`${paramName} must be a string`],
      };
    }

    // Empty string handling - convert to undefined
    if (value.length === 0) {
      return { isValid: true, sanitizedValue: undefined, errors: [] };
    }

    // Length validation (max 1000 characters as per test expectations)
    if (value.length > 1000) {
      return {
        isValid: false,
        sanitizedValue: value,
        errors: [
          `${paramName} is too long (${value.length} characters)`,
          'Pagination cursors should be less than 1000 characters'
        ],
      };
    }

    // Check for invalid cursor format patterns
    if (!/^[A-Za-z0-9+/=_-]+$/.test(value)) {
      return {
        isValid: false,
        sanitizedValue: value,
        errors: [
          `${paramName} must be a valid pagination cursor`,
          'Cursors should be base64 encoded strings',
          'Invalid characters found in cursor',
          `Received: "${value}"`
        ],
      };
    }

    return { isValid: true, sanitizedValue: value, errors: [] };
  }

  /**
   * Get contextual information about parameter usage
   */
  private static getParameterContext(paramName: string): string {
    const contexts: Record<string, string> = {
      limit: 'to control result set size and prevent memory issues',
      min_hits: 'to filter rules by activity level',
      duration: 'in minutes for temporary rule changes',
      hours: 'for time-based filtering',
      interval: 'in seconds for data aggregation',
      fetch_limit: 'to prevent excessive API calls',
      analysis_limit: 'to balance performance and accuracy'
    };
    
    return contexts[paramName] || '';
  }
}

/**
 * Enhanced null safety utilities with improved Object conversion prevention
 */
export class SafeAccess {
  /**
   * Safely access nested object properties with enhanced null checking
   */
  static getNestedValue(obj: ValidatableValue, path: string, defaultValue: unknown = undefined): unknown {
    // Enhanced null/undefined checking to prevent Object conversion errors
    if (obj === null || obj === undefined) {
      return defaultValue;
    }
    
    // Strict type checking to prevent Object conversion errors
    if (typeof obj !== 'object') {
      return defaultValue;
    }
    
    // Additional safety check for arrays and other object types
    if (Array.isArray(obj)) {
      return defaultValue;
    }

    // Validate path parameter
    if (!path || typeof path !== 'string' || path.trim() === '') {
      return defaultValue;
    }

    const keys = path.split('.');
    let current: any = obj;

    for (const key of keys) {
      // Enhanced null checking at each level
      if (current === null || current === undefined) {
        return defaultValue;
      }
      
      // Prevent Object conversion errors
      if (typeof current !== 'object') {
        return defaultValue;
      }
      
      // Additional safety for arrays
      if (Array.isArray(current)) {
        return defaultValue;
      }
      
      // Safe property access with hasOwnProperty check
      if (!Object.prototype.hasOwnProperty.call(current, key)) {
        return defaultValue;
      }
      
      current = current[key];
    }

    return current !== undefined ? current : defaultValue;
  }

  /**
   * Safely ensure an array with enhanced type checking
   */
  static ensureArray<T>(value: unknown, defaultValue: T[] = []): T[] {
    // Enhanced null/undefined handling
    if (value === null || value === undefined) {
      return defaultValue;
    }
    
    // Strict array checking
    if (Array.isArray(value)) {
      return value;
    }
    
    return defaultValue;
  }

  /**
   * Safely ensure an object with enhanced null checking
   */
  static ensureObject(value: unknown, defaultValue: Record<string, unknown> = {}): Record<string, unknown> {
    // Enhanced null/undefined checking to prevent Object conversion errors
    if (value === null || value === undefined) {
      return defaultValue;
    }
    
    // Strict object type checking
    if (typeof value === 'object' && !Array.isArray(value)) {
      // Additional check for object-like structures
      try {
        // Verify it's a plain object and not a complex object like Date, RegExp, etc.
        if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
          return value as Record<string, unknown>;
        }
        return defaultValue;
      } catch {
        return defaultValue;
      }
    }
    
    return defaultValue;
  }

  /**
   * Safely access array with enhanced null checking
   */
  static safeArrayAccess<T>(
    array: unknown,
    accessor: (_: T[]) => unknown,
    defaultValue: unknown = undefined
  ): unknown {
    const safeArray = SafeAccess.ensureArray<T>(array);
    if (safeArray.length === 0) {
      return defaultValue;
    }
    
    // Enhanced error handling with type checking
    try {
      if (typeof accessor !== 'function') {
        return defaultValue;
      }
      return accessor(safeArray);
    } catch (_error) {
      // Log error for debugging but don't expose it
      return defaultValue;
    }
  }

  /**
   * Safely process array with enhanced filtering for null/undefined values
   */
  static safeArrayMap<T, R>(
    array: unknown,
    mapper: (_: T, __: number) => R,
    filter: (item: T) => boolean = (item) => item !== null && item !== undefined
  ): R[] {
    const safeArray = SafeAccess.ensureArray<T>(array);
    
    // Enhanced parameter validation
    if (typeof mapper !== 'function') {
      return [];
    }
    
    if (typeof filter !== 'function') {
      filter = (item) => item !== null && item !== undefined;
    }
    
    try {
      return safeArray
        .filter(item => {
          try {
            return filter(item);
          } catch {
            return false;
          }
        })
        .map((item, index) => {
          try {
            return mapper(item, index);
          } catch {
            return null as any;
          }
        })
        .filter(result => result !== null && result !== undefined);
    } catch {
      return [];
    }
  }

  /**
   * Safely filter array with enhanced null/undefined checking
   */
  static safeArrayFilter<T>(
    array: unknown,
    predicate: (item: T) => boolean
  ): T[] {
    const safeArray = SafeAccess.ensureArray<T>(array);
    
    // Enhanced parameter validation
    if (typeof predicate !== 'function') {
      return safeArray.filter(item => item !== null && item !== undefined);
    }
    
    return safeArray.filter(item => {
      if (item === null || item === undefined) {
        return false;
      }
      try {
        return predicate(item);
      } catch {
        return false;
      }
    });
  }

  /**
   * Enhanced type checking utility to prevent Object conversion errors
   */
  static isValidObject(value: unknown): value is Record<string, unknown> {
    if (value === null || value === undefined) {
      return false;
    }
    
    if (typeof value !== 'object') {
      return false;
    }
    
    if (Array.isArray(value)) {
      return false;
    }
    
    // Check for complex objects that shouldn't be treated as plain objects
    try {
      const proto = Object.getPrototypeOf(value);
      return proto === Object.prototype || proto === null;
    } catch {
      return false;
    }
  }

  /**
   * Enhanced type checking utility for arrays
   */
  static isValidArray(value: unknown): value is unknown[] {
    return Array.isArray(value);
  }

  /**
   * Safe string conversion with null handling
   */
  static safeToString(value: unknown, defaultValue = ''): string {
    if (value === null || value === undefined) {
      return defaultValue;
    }
    
    if (typeof value === 'string') {
      return value;
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    
    // For objects, arrays, and other complex types, return default
    return defaultValue;
  }

  /**
   * Safe number conversion with enhanced null handling
   */
  static safeToNumber(value: unknown, defaultValue = 0): number {
    if (value === null || value === undefined) {
      return defaultValue;
    }
    
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : defaultValue;
    }
    
    if (typeof value === 'string') {
      if (value.trim() === '') {
        return defaultValue;
      }
      const num = Number(value);
      return Number.isFinite(num) ? num : defaultValue;
    }
    
    return defaultValue;
  }
}

/**
 * Search query sanitization utilities
 */
export class QuerySanitizer {
  /**
   * Sanitize search query to prevent injection attacks and validate basic structure
   */
  static sanitizeSearchQuery(query: string): ValidationResult {
    if (!query || typeof query !== 'string') {
      return {
        isValid: false,
        errors: ['Query must be a non-empty string']
      };
    }

    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return {
        isValid: false,
        errors: ['Query cannot be empty']
      };
    }

    // Enhanced dangerous patterns detection
    const dangerousPatterns = [
      // SQL injection patterns
      /;\s*(drop|delete|truncate|update|insert|alter|create|exec|execute)\s+/i,
      /\b(union\s+select|select\s+.*\s+from|insert\s+into)\b/i,
      /--\s*$|\/\*.*\*\//,  // SQL comments
      /\b(or|and)\s+1\s*=\s*1\b/i,  // Common SQL injection
      /\b(or|and)\s+.*\s*=\s*.*\s*(--|#)/i,  // SQL comment injection
      
      // Script injection patterns
      /<script.*?>.*?<\/script>/i,  // Script tags
      /<iframe.*?>.*?<\/iframe>/i,  // Iframe tags
      /javascript:/i,  // JavaScript protocol
      /data:text\/html/i,  // Data URLs
      /eval\s*\(/i,  // eval function
      /setTimeout\s*\(/i,  // setTimeout function
      /setInterval\s*\(/i,  // setInterval function
      /Function\s*\(/i,  // Function constructor
      /expression\s*\(/i,  // CSS expression
      
      // Event handlers and DOM manipulation
      /\b(onload|onerror|onclick|onmouseover|onmouseout|onfocus|onblur)\s*=/i,
      /document\.(write|writeln|createElement)/i,
      /window\.(location|open)/i,
      
      // Template injection patterns
      /\$\{.*\}/,  // Template literals
      /\{\{.*\}\}/,  // Handlebars/Angular templates
      /<%.*%>/,  // JSP/ASP templates
      
      // File system and system commands
      /\b(cat|ls|pwd|rm|mv|cp|chmod|chown|kill|ps|top|wget|curl)\s+/i,
      /\.\.\/|\.\.\\|\/etc\/|\/var\/|\/tmp\/|c:\\|%systemroot%/i,
      
      // Network and protocol exploitation
      /file:\/\/|ftp:\/\/|ldap:\/\/|gopher:\/\/|dict:\/\//i,
      /\b(ping|traceroute|nslookup|dig|netstat|ifconfig)\s+/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(trimmedQuery)) {
        return {
          isValid: false,
          errors: ['Query contains potentially dangerous content']
        };
      }
    }

    // Basic structure validation for search queries
    const structuralIssues = [];
    
    // Check for unmatched parentheses
    const openParens = (trimmedQuery.match(/\(/g) || []).length;
    const closeParens = (trimmedQuery.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      structuralIssues.push('Unmatched parentheses in query');
    }

    // Check for unmatched brackets
    const openBrackets = (trimmedQuery.match(/\[/g) || []).length;
    const closeBrackets = (trimmedQuery.match(/\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      structuralIssues.push('Unmatched brackets in query');
    }

    // Check for unmatched quotes
    const singleQuotes = (trimmedQuery.match(/'/g) || []).length;
    const doubleQuotes = (trimmedQuery.match(/"/g) || []).length;
    if (singleQuotes % 2 !== 0) {
      structuralIssues.push('Unmatched single quotes in query');
    }
    if (doubleQuotes % 2 !== 0) {
      structuralIssues.push('Unmatched double quotes in query');
    }

    // Check for suspicious character sequences
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(trimmedQuery)) {
      structuralIssues.push('Query contains control characters');
    }

    // Check for excessive nesting
    const maxNestingDepth = 10;
    let currentDepth = 0;
    let maxDepth = 0;
    for (const char of trimmedQuery) {
      if (char === '(' || char === '[') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === ')' || char === ']') {
        currentDepth--;
      }
    }
    if (maxDepth > maxNestingDepth) {
      structuralIssues.push(`Query nesting too deep (maximum ${maxNestingDepth} levels)`);
    }

    // Enhanced length validation with context
    if (trimmedQuery.length > 2000) {
      structuralIssues.push('Query is too long (maximum 2000 characters)');
    } else if (trimmedQuery.length > 1000) {
      // Warning for very long queries - consider breaking it into smaller parts
    }

    // Check for potential ReDoS (Regular Expression Denial of Service) patterns
    const redosPatterns = [
      /(\(.*\+.*\){3,})/,  // Nested quantifiers
      /(\*.*\+|\+.*\*)/,   // Alternating quantifiers
      /(\{.*,.*\}.*\{.*,.*\})/  // Multiple range quantifiers
    ];
    
    for (const pattern of redosPatterns) {
      if (pattern.test(trimmedQuery)) {
        structuralIssues.push('Query contains potentially problematic regex patterns');
        break;
      }
    }

    if (structuralIssues.length > 0) {
      return {
        isValid: false,
        errors: structuralIssues
      };
    }

    // Normalize common patterns for better parsing
    const normalizedQuery = trimmedQuery
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/\s*:\s*/g, ':')  // Remove spaces around colons
      .replace(/\s*>\s*=\s*/g, '>=')  // Handle spaced '>='
      .replace(/\s*<\s*=\s*/g, '<=')  // Handle spaced '<='
      .replace(/\s*!\s*=\s*/g, '!=')  // Handle spaced '!='
      .replace(/\s*(>=|<=|!=|>|<)\s*/g, '$1')  // Remove spaces around operators
      .replace(/\s+(AND|OR|NOT)\s+/gi, ' $1 ');  // Normalize logical operators

    return {
      isValid: true,
      errors: [],
      sanitizedValue: normalizedQuery
    };
  }

  /**
   * Validate and normalize field names for cross-reference queries
   */
  static validateFieldName(fieldName: string, allowedFields: string[]): ValidationResult {
    if (!fieldName || typeof fieldName !== 'string') {
      return {
        isValid: false,
        errors: ['Field name must be a non-empty string']
      };
    }

    const cleanFieldName = fieldName.trim();
    
    // Check if field is in allowed list
    if (!allowedFields.includes(cleanFieldName)) {
      return {
        isValid: false,
        errors: [`Field '${cleanFieldName}' is not allowed. Valid fields: ${allowedFields.join(', ')}`]
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: cleanFieldName
    };
  }

  /**
   * Validate field names in search queries and provide helpful error messages
   */
  static validateQueryFields(query: string, entityType: string): ValidationResult {
    if (!query || typeof query !== 'string') {
      return {
        isValid: false,
        errors: ['Query must be a non-empty string']
      };
    }

    // FieldValidator is now imported at the top of the file
    
    // Extract field names from query using simple regex
    // Matches patterns like "field_name:" or "field_name:value"
    const fieldPattern = /(\w+):/g;
    const foundFields: string[] = [];
    let match;
    
    while ((match = fieldPattern.exec(query)) !== null) {
      const fieldName = match[1];
      if (!foundFields.includes(fieldName)) {
        foundFields.push(fieldName);
      }
    }

    if (foundFields.length === 0) {
      // Check for wildcard-only queries that can cause timeouts
      const trimmedQuery = query.trim();
      
      // Detect patterns that are essentially wildcard-only or overly broad
      const problematicPatterns = [
        /^\*+$/,                          // Pure wildcards: "*", "**", etc.
        /^\*\s*$|^\s*\*$/,               // Wildcards with whitespace
        /^[*\s]+$/,                     // Only wildcards and spaces
        /^\*+\s*(AND|OR|NOT)\s*\*+$/i,   // Multiple wildcards with operators
        /^[*\s()]+$/,                 // Wildcards, spaces, and parentheses only
      ];
      
      // Check if query matches any problematic pattern
      for (const pattern of problematicPatterns) {
        if (pattern.test(trimmedQuery)) {
          return {
            isValid: false,
            errors: [
              'Wildcard-only queries are not supported as they can cause performance issues',
              'Please provide specific search criteria instead of using bare wildcards',
              `Examples for ${entityType}:`,
              ...(entityType === 'flows' ? [
                '  • "protocol:tcp" - search for TCP flows',
                '  • "blocked:true" - search for blocked traffic', 
                '  • "source_ip:192.168.*" - search specific IP range',
                '  • "bytes:>1000000" - search for large transfers'
              ] : entityType === 'alarms' ? [
                '  • "severity:high" - search for high severity alarms',
                '  • "type:intrusion" - search for intrusion alarms',
                '  • "resolved:false" - search for unresolved alarms',
                '  • "source_ip:192.168.*" - search by source IP'
              ] : entityType === 'rules' ? [
                '  • "action:block" - search for blocking rules',
                '  • "target_value:*.facebook.com" - search social media rules',
                '  • "enabled:true" - search for active rules',
                '  • "direction:outbound" - search outbound rules'
              ] : entityType === 'devices' ? [
                '  • "online:true" - search for online devices',
                '  • "mac_vendor:Apple" - search by device manufacturer',
                '  • "name:*iPhone*" - search by device name pattern',
                '  • "ip:192.168.1.*" - search by IP range'
              ] : [
                '  • Use field:value syntax with specific criteria',
                '  • Combine multiple conditions with AND/OR operators',
                '  • Use wildcards within field values, not as standalone queries'
              ])
            ]
          };
        }
      }
      
      // For other queries with no structured fields, allow them (might be simple text search)
      return {
        isValid: true,
        errors: [],
        sanitizedValue: query
      };
    }

    const invalidFields: string[] = [];
    const suggestions: string[] = [];

    // Validate each field
    for (const field of foundFields) {
      const validation = FieldValidator.validateField(field, entityType as any);
      if (!validation.isValid) {
        invalidFields.push(field);
        if (validation.suggestion) {
          suggestions.push(`${field}: ${validation.suggestion}`);
        }
      }
    }

    if (invalidFields.length > 0) {
      return {
        isValid: false,
        errors: [
          `Invalid field(s) in query: ${invalidFields.join(', ')}`,
          ...suggestions
        ]
      };
    }

    // Validate query complexity to prevent performance issues
    const complexityCheck = QuerySanitizer.validateQueryComplexity(query);
    if (!complexityCheck.isValid) {
      return complexityCheck;
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: query
    };
  }

  /**
   * Validate query complexity to prevent performance issues
   */
  static validateQueryComplexity(query: string): ValidationResult {
    if (!query || typeof query !== 'string') {
      return {
        isValid: true,
        errors: []
      };
    }

    const complexityIssues: string[] = [];

    // Check for excessive logical operators (potential performance issue)
    const orCount = (query.match(/\bOR\b/gi) || []).length;
    const andCount = (query.match(/\bAND\b/gi) || []).length;
    const totalLogicalOps = orCount + andCount;

    if (totalLogicalOps > 20) {
      complexityIssues.push(`Too many logical operators (${totalLogicalOps}). Maximum recommended: 20`);
    }

    // Check for excessive wildcards (can cause performance issues)
    const wildcardCount = (query.match(/\*/g) || []).length;
    if (wildcardCount > 10) {
      complexityIssues.push(`Too many wildcards (${wildcardCount}). Maximum recommended: 10`);
    }

    // Check for excessive range queries
    const rangeCount = (query.match(/\[[^\]]+\s+TO\s+[^\]]+\]/gi) || []).length;
    if (rangeCount > 5) {
      complexityIssues.push(`Too many range queries (${rangeCount}). Maximum recommended: 5`);
    }

    // Check for deeply nested parentheses
    let maxDepth = 0;
    let currentDepth = 0;
    for (const char of query) {
      if (char === '(') {
        currentDepth++;
        maxDepth = Math.max(maxDepth, currentDepth);
      } else if (char === ')') {
        currentDepth--;
      }
    }

    if (maxDepth > 5) {
      complexityIssues.push(`Query nesting too deep (${maxDepth} levels). Maximum recommended: 5`);
    }

    // Check for excessive field:value pairs
    const fieldValuePairs = (query.match(/\w+:[^:\s]+/g) || []).length;
    if (fieldValuePairs > 15) {
      complexityIssues.push(`Too many field:value pairs (${fieldValuePairs}). Maximum recommended: 15`);
    }

    if (complexityIssues.length > 0) {
      return {
        isValid: false,
        errors: [
          'Query is too complex and may cause performance issues:',
          ...complexityIssues,
          'Consider breaking complex queries into smaller, simpler queries for better performance.'
        ]
      };
    }

    return {
      isValid: true,
      errors: []
    };
  }
}