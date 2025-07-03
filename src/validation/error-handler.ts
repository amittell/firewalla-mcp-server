/**
 * Centralized Error Handling and Validation for Firewalla MCP Server
 * Provides consistent error responses and comprehensive validation utilities
 */

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
   * Validate required string parameter
   */
  static validateRequiredString(value: unknown, paramName: string): ValidationResult {
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
  static validateOptionalString(value: unknown, paramName: string): ValidationResult {
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
    value: unknown,
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
    value: unknown,
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
    } 
      if (max && max > 1000) {
        return `${paramName} exceeds system limits${paramContext ? ` ${paramContext}` : ''} (got ${value}, maximum: ${max} for performance reasons)`;
      }
      return `${paramName} is too large${paramContext ? ` ${paramContext}` : ''} (got ${value}, maximum: ${max})`;
    
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
  static getNestedValue(obj: ValidatableValue, path: string, defaultValue: unknown = undefined): unknown {
    if (!obj || typeof obj !== 'object') {
      return defaultValue;
    }

    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return defaultValue;
      }
      current = (current as any)[key];
    }

    return current !== undefined ? current : defaultValue;
  }

  /**
   * Safely ensure an array
   */
  static ensureArray<T>(value: unknown, defaultValue: T[] = []): T[] {
    if (Array.isArray(value)) {
      return value;
    }
    return defaultValue;
  }

  /**
   * Safely ensure an object
   */
  static ensureObject(value: unknown, defaultValue: Record<string, unknown> = {}): Record<string, unknown> {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    return defaultValue;
  }

  /**
   * Safely access array with null checking
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
    array: unknown,
     
    mapper: (_: T, __: number) => R,
     
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
    array: unknown,
     
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
}