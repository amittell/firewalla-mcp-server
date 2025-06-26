/**
 * Centralized Error Handling and Validation for Firewalla MCP Server
 * Provides consistent error responses and comprehensive validation utilities
 */

export interface StandardError {
  error: true;
  message: string;
  tool: string;
  details?: Record<string, any>;
  validation_errors?: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedValue?: any;
}

/**
 * Standardized error response creator
 */
export class ErrorHandler {
  /**
   * Create a standard error response
   */
  static createErrorResponse(tool: string, message: string, details?: Record<string, any>, validationErrors?: string[]): {
    content: Array<{ type: string; text: string }>;
    isError: true;
  } {
    const errorResponse: StandardError = {
      error: true,
      message: message,
      tool: tool,
      ...(details && { details }),
      ...(validationErrors?.length && { validation_errors: validationErrors })
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
   * Wrap a function to ensure consistent error handling
   */
  static wrapTool<T extends any[], R>(
    toolName: string,
    // eslint-disable-next-line no-unused-vars
    fn: (..._args: T) => Promise<R>
  ) {
    return async (...args: T): Promise<R> => {
      try {
        return await fn(...args);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
        throw ErrorHandler.createErrorResponse(toolName, errorMessage);
      }
    };
  }
}

/**
 * Parameter validation utilities
 */
export class ParameterValidator {
  /**
   * Validate required string parameter
   */
  static validateRequiredString(value: any, paramName: string): ValidationResult {
    if (value === undefined || value === null) {
      return {
        isValid: false,
        errors: [`${paramName} is required`]
      };
    }

    if (typeof value !== 'string') {
      return {
        isValid: false,
        errors: [`${paramName} must be a string, got ${typeof value}`]
      };
    }

    if (value.trim().length === 0) {
      return {
        isValid: false,
        errors: [`${paramName} cannot be empty`]
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: value.trim()
    };
  }

  /**
   * Validate optional string parameter
   */
  static validateOptionalString(value: any, paramName: string): ValidationResult {
    if (value === undefined || value === null) {
      return {
        isValid: true,
        errors: [],
        sanitizedValue: undefined
      };
    }

    if (typeof value !== 'string') {
      return {
        isValid: false,
        errors: [`${paramName} must be a string if provided, got ${typeof value}`]
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: value.trim()
    };
  }

  /**
   * Validate numeric parameter with range checking
   */
  static validateNumber(
    value: any, 
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

    if (value === undefined || value === null) {
      if (required) {
        return {
          isValid: false,
          errors: [`${paramName} is required`]
        };
      }
      
      // Validate default value against constraints if provided
      if (defaultValue !== undefined) {
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

    const numValue = Number(value);
    if (isNaN(numValue)) {
      return {
        isValid: false,
        errors: [`${paramName} must be a valid number`]
      };
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
   * Validate enum parameter
   */
  static validateEnum(
    value: any,
    paramName: string,
    allowedValues: string[],
    required = false,
    defaultValue?: string
  ): ValidationResult {
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

    if (typeof value !== 'string') {
      return {
        isValid: false,
        errors: [`${paramName} must be a string`]
      };
    }

    if (!allowedValues.includes(value)) {
      return {
        isValid: false,
        errors: [`${paramName} must be one of: ${allowedValues.join(', ')}, got '${value}'`]
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: value
    };
  }

  /**
   * Validate boolean parameter
   */
  static validateBoolean(
    value: any,
    paramName: string,
    defaultValue?: boolean
  ): ValidationResult {
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

    // Handle string representations of booleans
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
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
    }

    return {
      isValid: false,
      errors: [`${paramName} must be a boolean value`]
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
    } else {
      if (max && max > 1000) {
        return `${paramName} exceeds system limits${paramContext ? ` ${paramContext}` : ''} (got ${value}, maximum: ${max} for performance reasons)`;
      }
      return `${paramName} is too large${paramContext ? ` ${paramContext}` : ''} (got ${value}, maximum: ${max})`;
    }
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
 * Null safety utilities
 */
export class SafeAccess {
  /**
   * Safely access nested object properties
   */
  static getNestedValue(obj: any, path: string, defaultValue: any = undefined): any {
    if (!obj || typeof obj !== 'object') {
      return defaultValue;
    }

    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return defaultValue;
      }
      current = current[key];
    }

    return current !== undefined ? current : defaultValue;
  }

  /**
   * Safely ensure an array
   */
  static ensureArray<T>(value: any, defaultValue: T[] = []): T[] {
    if (Array.isArray(value)) {
      return value;
    }
    return defaultValue;
  }

  /**
   * Safely ensure an object
   */
  static ensureObject(value: any, defaultValue: Record<string, any> = {}): Record<string, any> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }
    return defaultValue;
  }

  /**
   * Safely access array with null checking
   */
  static safeArrayAccess<T>(
    array: any,
    // eslint-disable-next-line no-unused-vars
    accessor: (_: T[]) => any,
    defaultValue: any = undefined
  ): any {
    const safeArray = SafeAccess.ensureArray<T>(array);
    if (safeArray.length === 0) {
      return defaultValue;
    }
    
    try {
      return accessor(safeArray);
    } catch {
      return defaultValue;
    }
  }

  /**
   * Safely process array with filtering for null/undefined values
   */
  static safeArrayMap<T, R>(
    array: any,
    // eslint-disable-next-line no-unused-vars
    mapper: (_: T, __: number) => R,
    // eslint-disable-next-line no-unused-vars
    filter: (item: T) => boolean = (item) => item !== null && item !== undefined
  ): R[] {
    const safeArray = SafeAccess.ensureArray<T>(array);
    return safeArray
      .filter(filter)
      .map(mapper)
      .filter(result => result !== null && result !== undefined);
  }

  /**
   * Safely filter array with null/undefined checking
   */
  static safeArrayFilter<T>(
    array: any,
    // eslint-disable-next-line no-unused-vars
    predicate: (item: T) => boolean
  ): T[] {
    const safeArray = SafeAccess.ensureArray<T>(array);
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
}

/**
 * Search query sanitization utilities
 */
export class QuerySanitizer {
  /**
   * Sanitize search query to prevent injection attacks
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

    // Check for potentially dangerous patterns
    const dangerousPatterns = [
      /;\s*(drop|delete|truncate|update|insert)\s+/i,
      /\$\{.*\}/,  // Template literals
      /<script.*?>.*?<\/script>/i,  // Script tags
      /javascript:/i,  // JavaScript protocol
      /eval\s*\(/i,  // eval function
      /expression\s*\(/i,  // CSS expression
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(trimmedQuery)) {
        return {
          isValid: false,
          errors: ['Query contains potentially dangerous content']
        };
      }
    }

    // Basic length validation
    if (trimmedQuery.length > 2000) {
      return {
        isValid: false,
        errors: ['Query is too long (maximum 2000 characters)']
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: trimmedQuery
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
}