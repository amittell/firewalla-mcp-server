/**
 * Cursor Validation Utilities for Firewalla MCP Server
 * Provides comprehensive cursor format validation and standardized error handling
 */

import { ErrorType, createErrorResponse, type ValidationResult } from './error-handler.js';
import { VALIDATION_CONFIG } from '../config/limits.js';

/**
 * Cursor validation configuration
 */
export interface CursorValidationConfig {
  /** Maximum allowed cursor length */
  maxLength?: number;
  /** Allowed cursor format patterns */
  allowedPatterns?: RegExp[];
  /** Whether to allow empty cursors */
  allowEmpty?: boolean;
  /** Whether to perform strict format validation */
  strictValidation?: boolean;
}

/**
 * Default cursor validation configuration
 */
const DEFAULT_CURSOR_CONFIG: Required<CursorValidationConfig> = {
  maxLength: VALIDATION_CONFIG.CURSOR.maxLength,
  allowedPatterns: [
    /^[a-zA-Z0-9\-_=+/]+$/, // Base64-like pattern
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/, // UUID pattern
    /^[a-zA-Z0-9]{20,}$/, // Generic alphanumeric (min 20 chars)
  ],
  allowEmpty: false,
  strictValidation: true,
};

/**
 * Cursor validation error details
 */
export interface CursorValidationError {
  type: 'format' | 'length' | 'pattern' | 'empty' | 'invalid_type';
  message: string;
  providedValue: unknown;
  expectedFormat?: string;
}

/**
 * Enhanced cursor validation result
 */
export interface CursorValidationResult extends ValidationResult {
  validationError?: CursorValidationError;
  suggestions?: string[];
}

/**
 * Cursor validation utilities
 */
export class CursorValidator {
  /**
   * Validate cursor format and return detailed validation result
   * 
   * @param cursor - The cursor value to validate
   * @param paramName - Name of the parameter for error messages
   * @param config - Validation configuration
   * @returns Detailed validation result
   */
  static validateCursor(
    cursor: unknown,
    paramName: string = 'cursor',
    config: Partial<CursorValidationConfig> = {}
  ): CursorValidationResult {
    const finalConfig = { ...DEFAULT_CURSOR_CONFIG, ...config };

    // Handle null/undefined
    if (cursor === null || cursor === undefined) {
      if (finalConfig.allowEmpty) {
        return {
          isValid: true,
          errors: [],
          sanitizedValue: undefined,
        };
      }
      
      return {
        isValid: false,
        errors: [`${paramName} cannot be null or undefined`],
        validationError: {
          type: 'empty',
          message: 'Cursor cannot be null or undefined',
          providedValue: cursor,
          expectedFormat: 'Valid cursor string',
        },
        suggestions: [
          'Provide a valid cursor from a previous API response',
          'Omit the cursor parameter to start from the beginning',
        ],
      };
    }

    // Type validation
    if (typeof cursor !== 'string') {
      return {
        isValid: false,
        errors: [`${paramName} must be a string, got ${typeof cursor}`],
        validationError: {
          type: 'invalid_type',
          message: `Cursor must be a string, got ${typeof cursor}`,
          providedValue: cursor,
          expectedFormat: 'String',
        },
        suggestions: [
          'Ensure cursor is provided as a string value',
          'Check that the cursor is not being converted to another type',
        ],
      };
    }

    // Empty string validation
    if (cursor.trim().length === 0) {
      if (finalConfig.allowEmpty) {
        return {
          isValid: true,
          errors: [],
          sanitizedValue: undefined,
        };
      }
      
      return {
        isValid: false,
        errors: [`${paramName} cannot be empty`],
        validationError: {
          type: 'empty',
          message: 'Cursor cannot be empty',
          providedValue: cursor,
          expectedFormat: 'Non-empty cursor string',
        },
        suggestions: [
          'Provide a cursor from a previous API response',
          'Remove the cursor parameter if not needed',
        ],
      };
    }

    // Length validation
    if (cursor.length > finalConfig.maxLength) {
      return {
        isValid: false,
        errors: [`${paramName} exceeds maximum length of ${finalConfig.maxLength} characters`],
        validationError: {
          type: 'length',
          message: `Cursor exceeds maximum length of ${finalConfig.maxLength} characters`,
          providedValue: cursor,
          expectedFormat: `String with max ${finalConfig.maxLength} characters`,
        },
        suggestions: [
          'Use a valid cursor from the API response',
          'Check for cursor truncation or corruption',
        ],
      };
    }

    // Pattern validation (if strict validation is enabled)
    if (finalConfig.strictValidation) {
      const matchesPattern = finalConfig.allowedPatterns.some(pattern => pattern.test(cursor));
      
      if (!matchesPattern) {
        return {
          isValid: false,
          errors: [`${paramName} format is invalid`],
          validationError: {
            type: 'pattern',
            message: 'Cursor format does not match expected patterns',
            providedValue: cursor,
            expectedFormat: 'Base64-like string, UUID, or alphanumeric string (min 20 chars)',
          },
          suggestions: [
            'Use cursor values returned by the API',
            'Check for special characters or encoding issues',
            'Verify cursor was not manually constructed',
          ],
        };
      }
    }

    // Check for suspicious patterns that might indicate issues
    const suspiciousPatterns = [
      /[<>'"&]/, // HTML/XML injection attempts
      /\.\.\//, // Path traversal attempts
      /\s/, // Whitespace (cursors shouldn't contain spaces)
    ];

    // Check for control characters separately to avoid ESLint no-control-regex rule
    const hasControlChars = cursor.split('').some(char => {
      const code = char.charCodeAt(0);
      return (code >= 0 && code <= 31) || code === 127;
    });

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(cursor)) {
        return {
          isValid: false,
          errors: [`${paramName} contains invalid characters`],
          validationError: {
            type: 'format',
            message: 'Cursor contains suspicious or invalid characters',
            providedValue: cursor,
            expectedFormat: 'Clean alphanumeric cursor string',
          },
          suggestions: [
            'Use only cursors returned by the API',
            'Check for encoding or escaping issues',
            'Verify cursor source and integrity',
          ],
        };
      }
    }

    // Check for control characters
    if (hasControlChars) {
      return {
        isValid: false,
        errors: [`${paramName} contains control characters`],
        validationError: {
          type: 'format',
          message: 'Cursor contains control characters',
          providedValue: cursor,
          expectedFormat: 'Clean alphanumeric cursor string without control characters',
        },
        suggestions: [
          'Use only cursors returned by the API',
          'Check for encoding or character corruption',
          'Verify cursor source and integrity',
        ],
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: cursor.trim(),
    };
  }

  /**
   * Create standardized error response for cursor validation failures
   */
  static createCursorErrorResponse(
    toolName: string,
    validationResult: CursorValidationResult,
    paramName: string = 'cursor'
  ) {
    const error = validationResult.validationError;
    
    return createErrorResponse(
      toolName,
      `Invalid ${paramName} parameter`,
      ErrorType.VALIDATION_ERROR,
      {
        parameter: paramName,
        validation_error: error?.type,
        provided_value: error?.providedValue,
        expected_format: error?.expectedFormat,
        suggestions: validationResult.suggestions,
        documentation: 'Cursors should be obtained from previous response pagination metadata',
        troubleshooting: [
          'Ensure cursor is copied exactly from API response',
          'Check for encoding or character corruption',
          'Verify cursor has not expired or been modified',
        ],
      },
      validationResult.errors
    );
  }

  /**
   * Quick validation for simple use cases
   * 
   * @param cursor - Cursor to validate
   * @param allowEmpty - Whether to allow empty/null cursors
   * @returns True if valid, false otherwise
   */
  static isValidCursor(cursor: unknown, allowEmpty: boolean = false): boolean {
    const result = this.validateCursor(cursor, 'cursor', { allowEmpty });
    return result.isValid;
  }

  /**
   * Sanitize cursor value, returning undefined for invalid cursors
   * 
   * @param cursor - Cursor to sanitize
   * @param config - Validation configuration
   * @returns Sanitized cursor or undefined
   */
  static sanitizeCursor(
    cursor: unknown,
    config: Partial<CursorValidationConfig> = {}
  ): string | undefined {
    const result = this.validateCursor(cursor, 'cursor', config);
    return result.isValid ? (result.sanitizedValue as string | undefined) : undefined;
  }

  /**
   * Generate example valid cursor for documentation
   */
  static getExampleCursor(): string {
    return 'eyJsYXN0X2lkIjoiMTIzNDU2IiwibGFzdF90cyI6MTY0MDk5NTIwMH0';
  }

  /**
   * Get cursor format documentation
   */
  static getCursorFormatInfo(): {
    description: string;
    formats: string[];
    examples: string[];
    restrictions: string[];
  } {
    return {
      description: 'Cursors are opaque tokens used for pagination, provided by the API in response metadata',
      formats: [
        'Base64-encoded strings',
        'UUID format (8-4-4-4-12 pattern)',
        'Alphanumeric strings (minimum 20 characters)',
      ],
      examples: [
        this.getExampleCursor(),
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        'abcd1234567890efghij1234567890',
      ],
      restrictions: [
        'Cannot contain whitespace or special characters',
        'Maximum length: 1000 characters',
        'Must be obtained from API responses',
        'Should not be manually constructed',
      ],
    };
  }
}

/**
 * Convenience function for cursor validation in handlers
 */
export function validateCursorParameter(
  cursor: unknown,
  toolName: string,
  paramName: string = 'cursor',
  config?: Partial<CursorValidationConfig>
): { isValid: true; cursor: string | undefined } | { isValid: false; errorResponse: any } {
  const result = CursorValidator.validateCursor(cursor, paramName, config);
  
  if (!result.isValid) {
    return {
      isValid: false,
      errorResponse: CursorValidator.createCursorErrorResponse(toolName, result, paramName),
    };
  }
  
  return {
    isValid: true,
    cursor: result.sanitizedValue as string | undefined,
  };
}