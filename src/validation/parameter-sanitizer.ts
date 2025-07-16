/**
 * Parameter Sanitization Utilities for Firewalla MCP Server
 * Provides early sanitization to prevent null/undefined from reaching Object operations
 */

import { ErrorType, createErrorResponse } from './error-handler.js';

// Simple type for tool arguments since registry/handlers were removed
export type ToolArgs = Record<string, unknown>;

/**
 * Sanitization configuration options
 */
export interface SanitizationConfig {
  /** Whether to allow null values to pass through (default: false) */
  allowNull?: boolean;
  /** Whether to allow undefined values to pass through (default: false) */
  allowUndefined?: boolean;
  /** Whether to convert string numbers to actual numbers (default: true) */
  convertNumbers?: boolean;
  /** Whether to trim string values (default: true) */
  trimStrings?: boolean;
  /** Whether to normalize empty strings to undefined (default: true) */
  normalizeEmpty?: boolean;
}

/**
 * Default sanitization configuration
 */
const DEFAULT_SANITIZATION_CONFIG: Required<SanitizationConfig> = {
  allowNull: false,
  allowUndefined: false,
  convertNumbers: true,
  trimStrings: true,
  normalizeEmpty: true,
};

/**
 * Result of parameter sanitization
 */
export interface ParameterSanitizationResult {
  isValid: boolean;
  sanitizedArgs?: ToolArgs;
  errors: string[];
}

/**
 * Parameter sanitization errors
 */
export class ParameterSanitizationError extends Error {
  public readonly errors: string[];
  public readonly originalArgs: unknown;

  constructor(errors: string[], originalArgs: unknown) {
    super(`Parameter sanitization failed: ${errors.join(', ')}`);
    this.name = 'ParameterSanitizationError';
    this.errors = errors;
    this.originalArgs = originalArgs;
  }
}

/**
 * Early parameter sanitizer to prevent null/undefined from reaching Object operations
 */
export class ParameterSanitizer {
  /**
   * Sanitize parameters early in the validation pipeline
   * 
   * @param args - Raw arguments from MCP client
   * @param config - Sanitization configuration
   * @returns Sanitization result with cleaned parameters
   */
  static sanitizeParameters(
    args: unknown,
    config: Partial<SanitizationConfig> = {}
  ): ParameterSanitizationResult {
    const finalConfig = { ...DEFAULT_SANITIZATION_CONFIG, ...config };
    const errors: string[] = [];

    // First-level null/undefined check
    if (args === null) {
      if (!finalConfig.allowNull) {
        errors.push('Parameters cannot be null');
        return { isValid: false, errors };
      }
      return { isValid: true, sanitizedArgs: {} as ToolArgs, errors: [] };
    }

    if (args === undefined) {
      if (!finalConfig.allowUndefined) {
        errors.push('Parameters cannot be undefined');
        return { isValid: false, errors };
      }
      return { isValid: true, sanitizedArgs: {} as ToolArgs, errors: [] };
    }

    // Type check - must be an object
    if (typeof args !== 'object') {
      errors.push(`Parameters must be an object, got ${typeof args}`);
      return { isValid: false, errors };
    }

    // Array check - arrays are objects but not valid parameter containers
    if (Array.isArray(args)) {
      errors.push('Parameters cannot be an array');
      return { isValid: false, errors };
    }

    // Deep sanitization of object properties
    try {
      const sanitizedArgs = this.sanitizeObject(args, finalConfig);
      return { isValid: true, sanitizedArgs: sanitizedArgs as ToolArgs, errors: [] };
    } catch (error) {
      if (error instanceof ParameterSanitizationError) {
        return { isValid: false, errors: error.errors };
      }
      return { isValid: false, errors: [`Sanitization failed: ${error instanceof Error ? error.message : 'Unknown error'}`] };
    }
  }

  /**
   * Safely sanitize an object without risking Object operations on null/undefined
   */
  private static sanitizeObject(
    obj: unknown,
    config: Required<SanitizationConfig>
  ): Record<string, unknown> {
    // Additional safety check
    if (obj === null || obj === undefined) {
      return {};
    }

    if (typeof obj !== 'object' || Array.isArray(obj)) {
      throw new ParameterSanitizationError(
        ['Invalid object type during sanitization'],
        obj
      );
    }

    const sanitized: Record<string, unknown> = {};
    const errors: string[] = [];

    // Safe iteration over object properties
    try {
      for (const [key, value] of Object.entries(obj)) {
        try {
          const sanitizedValue = this.sanitizeValue(value, config, key);
          
          // Only include non-undefined values unless specifically allowed
          if (sanitizedValue !== undefined || config.allowUndefined) {
            sanitized[key] = sanitizedValue;
          }
        } catch (error) {
          errors.push(`Error sanitizing property '${key}': ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    } catch (error) {
      throw new ParameterSanitizationError(
        [`Failed to iterate object properties: ${error instanceof Error ? error.message : 'Unknown error'}`],
        obj
      );
    }

    if (errors.length > 0) {
      throw new ParameterSanitizationError(errors, obj);
    }

    return sanitized;
  }

  /**
   * Sanitize individual parameter values
   */
  private static sanitizeValue(
    value: unknown,
    config: Required<SanitizationConfig>,
    propertyName: string
  ): unknown {
    // Handle null values
    if (value === null) {
      if (!config.allowNull) {
        return undefined; // Convert null to undefined for consistency
      }
      return null;
    }

    // Handle undefined values
    if (value === undefined) {
      return undefined;
    }

    // Handle string values
    if (typeof value === 'string') {
      let sanitizedString = value;

      if (config.trimStrings) {
        sanitizedString = sanitizedString.trim();
      }

      if (config.normalizeEmpty && sanitizedString === '') {
        return undefined;
      }

      // Attempt number conversion for numeric strings
      if (config.convertNumbers && this.isNumericString(sanitizedString)) {
        const numValue = Number(sanitizedString);
        if (Number.isFinite(numValue)) {
          return numValue;
        }
      }

      return sanitizedString;
    }

    // Handle arrays (recursively sanitize elements)
    if (Array.isArray(value)) {
      return value.map((item, index) => 
        this.sanitizeValue(item, config, `${propertyName}[${index}]`)
      );
    }

    // Handle nested objects (recursively sanitize)
    if (typeof value === 'object') {
      return this.sanitizeObject(value, config);
    }

    // Return primitive values as-is (numbers, booleans)
    return value;
  }

  /**
   * Check if a string represents a valid number
   */
  private static isNumericString(str: string): boolean {
    if (str === '' || str.includes(' ')) {
      return false;
    }
    return !isNaN(Number(str)) && isFinite(Number(str));
  }

  /**
   * Create error response for sanitization failures
   */
  static createSanitizationErrorResponse(
    toolName: string,
    sanitizationResult: ParameterSanitizationResult
  ) {
    return createErrorResponse(
      toolName,
      'Parameter sanitization failed',
      ErrorType.VALIDATION_ERROR,
      {
        sanitization_errors: sanitizationResult.errors,
        details: 'Parameters failed early sanitization checks',
        troubleshooting: 'Ensure all parameters are properly formatted and not null/undefined',
      },
      sanitizationResult.errors
    );
  }

  /**
   * Safe wrapper for Object operations that might receive null/undefined
   */
  static safeObjectEntries(obj: unknown): Array<[string, unknown]> {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return [];
    }
    
    try {
      return Object.entries(obj);
    } catch (_error) {
      // If Object.entries fails, return empty array
      return [];
    }
  }

  /**
   * Safe wrapper for Object.keys that might receive null/undefined
   */
  static safeObjectKeys(obj: unknown): string[] {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return [];
    }
    
    try {
      return Object.keys(obj);
    } catch (_error) {
      // If Object.keys fails, return empty array
      return [];
    }
  }

  /**
   * Safe wrapper for Object.values that might receive null/undefined
   */
  static safeObjectValues(obj: unknown): unknown[] {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return [];
    }
    
    try {
      return Object.values(obj);
    } catch (_error) {
      // If Object.values fails, return empty array
      return [];
    }
  }
}

/**
 * Convenient function to validate and sanitize parameters in one step
 */
export function validateAndSanitizeParameters(
  args: unknown,
  toolName: string,
  config?: Partial<SanitizationConfig>
): { sanitizedArgs: ToolArgs } | { errorResponse: any } {
  const sanitizationResult = ParameterSanitizer.sanitizeParameters(args, config);
  
  if (!sanitizationResult.isValid) {
    return {
      errorResponse: ParameterSanitizer.createSanitizationErrorResponse(
        toolName,
        sanitizationResult
      ),
    };
  }

  return { sanitizedArgs: sanitizationResult.sanitizedArgs! };
}