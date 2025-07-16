/**
 * @fileoverview Enhanced Error Handling System for Firewalla MCP Server
 *
 * This module provides a robust, LLM-optimized error handling system designed for
 * maximum retry success and clear user guidance. Features structured error responses
 * with actionable solutions and comprehensive validation utilities.
 *
 * Key Features:
 * - **LLM Retry Optimization**: Error messages structured for AI comprehension and retry success
 * - **Actionable Solutions**: Every error includes specific solution steps and allowed values
 * - **Structured Format**: Consistent error schema with solution/allowed_values fields
 * - **Recovery Guidance**: Context-aware error recovery suggestions
 * - **Validation Framework**: Enhanced parameter validation with detailed feedback
 *
 * @version 1.0.0
 * @author Alex Mittell <mittell@me.com> (https://github.com/amittell)
 * @since 2025-06-21
 */

import type { ValidationResult } from '../types.js';

/**
 * Enhanced error types with granular categorization for better error handling
 */
export enum ErrorType {
  // Parameter and validation errors
  VALIDATION_ERROR = 'validation_error',
  PARAMETER_MISSING = 'parameter_missing',
  PARAMETER_INVALID = 'parameter_invalid',
  PARAMETER_OUT_OF_RANGE = 'parameter_out_of_range',

  // Authentication and authorization errors
  AUTHENTICATION_ERROR = 'authentication_error',
  AUTHORIZATION_ERROR = 'authorization_error',

  // API and network errors
  API_ERROR = 'api_error',
  NETWORK_ERROR = 'network_error',
  TIMEOUT_ERROR = 'timeout_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',

  // Service and system errors
  SERVICE_UNAVAILABLE = 'service_unavailable',
  TOOL_DISABLED = 'tool_disabled',
  CACHE_ERROR = 'cache_error',

  // Search and query errors
  SEARCH_ERROR = 'search_error',
  QUERY_SYNTAX_ERROR = 'query_syntax_error',
  CORRELATION_ERROR = 'correlation_error',

  // Generic fallback
  UNKNOWN_ERROR = 'unknown_error',
}

/**
 * Enhanced error interface optimized for LLM retry success
 */
export interface EnhancedError {
  error: true;
  message: string;
  tool: string;
  errorType: ErrorType;
  timestamp: string;

  // LLM retry optimization fields
  solution?: {
    description: string;
    steps: string[];
    examples?: string[];
  };
  allowed_values?: Record<
    string,
    {
      type: string;
      values?: string[] | number[];
      range?: { min: number; max: number };
      pattern?: string;
      examples: string[];
    }
  >;

  // Context and debugging information
  context?: {
    endpoint?: string;
    parameters?: Record<string, unknown>;
    requestId?: string;
    correlationId?: string;
  };
  validation_errors?: string[];
  details?: Record<string, unknown>;

  // Recovery guidance
  recovery_hints?: {
    retry_recommended: boolean;
    retry_delay_ms?: number;
    alternative_tools?: string[];
    documentation_link?: string;
  };
}

/**
 * Parameter constraint definitions for enhanced validation
 */
export interface ParameterConstraints {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'enum';
  required: boolean;
  description: string;

  // String constraints
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;

  // Number constraints
  min?: number;
  max?: number;
  integer?: boolean;

  // Enum constraints
  allowedValues?: string[] | number[];

  // Array constraints
  itemType?: string;
  minItems?: number;
  maxItems?: number;

  // Examples for LLM guidance
  examples: string[];
  invalidExamples?: Array<{ value: string; reason: string }>;
}

/**
 * Tool parameter schema for validation and error generation
 */
export type ToolParameterSchema = Record<string, ParameterConstraints>;

/**
 * Create an enhanced error response optimized for LLM retry success
 *
 * @param tool - The name of the tool that generated the error
 * @param message - The primary error message
 * @param errorType - The specific type of error
 * @param options - Additional error configuration options
 * @returns Formatted error response for MCP protocol
 */
export function createEnhancedErrorResponse(
  tool: string,
  message: string,
  errorType: ErrorType,
  options: {
    solution?: EnhancedError['solution'];
    allowed_values?: EnhancedError['allowed_values'];
    context?: EnhancedError['context'];
    validation_errors?: string[];
    details?: Record<string, unknown>;
    recovery_hints?: EnhancedError['recovery_hints'];
  } = {}
): {
  content: Array<{ type: string; text: string }>;
  isError: true;
} {
  const {
    solution,
    allowed_values,
    context,
    validation_errors,
    details,
    recovery_hints,
  } = options;

  const errorResponse: EnhancedError = {
    error: true,
    message,
    tool,
    errorType,
    timestamp: new Date().toISOString(),
    ...(solution && { solution }),
    ...(allowed_values && { allowed_values }),
    ...(context && { context }),
    ...(validation_errors?.length && { validation_errors }),
    ...(details && { details }),
    ...(recovery_hints && { recovery_hints }),
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
 * Enhanced Parameter Validator with LLM-optimized error messages
 */
export class EnhancedParameterValidator {
  /**
   * Validate parameter against schema with enhanced error reporting
   */
  static validateParameter(
    value: unknown,
    paramName: string,
    schema: ParameterConstraints,
    tool: string
  ): ValidationResult & { enhancedError?: EnhancedError } {
    // Required parameter check
    if (schema.required && (value === undefined || value === null)) {
      const enhancedError: EnhancedError = {
        error: true,
        message: `Parameter '${paramName}' is required`,
        tool,
        errorType: ErrorType.PARAMETER_MISSING,
        timestamp: new Date().toISOString(),
        solution: {
          description: `The '${paramName}' parameter must be provided`,
          steps: [
            `Add the '${paramName}' parameter to your request`,
            `Ensure the parameter is not null or undefined`,
            `Use one of the valid formats shown in examples`,
          ],
          examples: schema.examples,
        },
        allowed_values: {
          [paramName]: {
            type: schema.type,
            values: schema.allowedValues,
            range:
              schema.min !== undefined && schema.max !== undefined
                ? { min: schema.min, max: schema.max }
                : undefined,
            pattern: schema.pattern?.source,
            examples: schema.examples,
          },
        },
        recovery_hints: {
          retry_recommended: true,
          documentation_link: `https://github.com/firewalla/mcp-server#${tool.replace(/_/g, '-')}`,
        },
      };

      return {
        isValid: false,
        errors: [`${paramName} is required`],
        enhancedError,
      };
    }

    // Optional parameter - return success if undefined/null
    if (!schema.required && (value === undefined || value === null)) {
      return {
        isValid: true,
        errors: [],
        sanitizedValue: undefined,
      };
    }

    // Type validation
    const typeValidation = this.validateType(value, paramName, schema, tool);
    if (!typeValidation.isValid) {
      return typeValidation;
    }

    // Value-specific validation based on type
    switch (schema.type) {
      case 'string':
        return this.validateString(value as string, paramName, schema, tool);
      case 'number':
        return this.validateNumber(value as number, paramName, schema, tool);
      case 'boolean':
        return this.validateBoolean(value, paramName, schema, tool);
      case 'enum':
        return this.validateEnum(value as string, paramName, schema, tool);
      case 'array':
        return this.validateArray(value as unknown[], paramName, schema, tool);
      case 'object':
        // For object types, we just check that it's an object
        if (typeof value !== 'object' || value === null) {
          return {
            isValid: false,
            errors: [`${paramName} must be an object`],
          };
        }
        return { isValid: true, errors: [], sanitizedValue: value };
      default:
        return { isValid: true, errors: [], sanitizedValue: value };
    }
  }

  /**
   * Validate type with enhanced error reporting
   */
  private static validateType(
    value: unknown,
    paramName: string,
    schema: ParameterConstraints,
    tool: string
  ): ValidationResult & { enhancedError?: EnhancedError } {
    const actualType = Array.isArray(value) ? 'array' : typeof value;

    if (actualType !== schema.type) {
      const enhancedError: EnhancedError = {
        error: true,
        message: `Parameter '${paramName}' must be of type ${schema.type}, got ${actualType}`,
        tool,
        errorType: ErrorType.PARAMETER_INVALID,
        timestamp: new Date().toISOString(),
        solution: {
          description: `Convert the '${paramName}' parameter to the correct type`,
          steps: [
            `Change '${paramName}' from ${actualType} to ${schema.type}`,
            `Use one of the valid formats shown in examples`,
            `Ensure the value meets all constraints for this parameter`,
          ],
          examples: schema.examples,
        },
        allowed_values: {
          [paramName]: {
            type: schema.type,
            values: schema.allowedValues,
            examples: schema.examples,
          },
        },
        recovery_hints: {
          retry_recommended: true,
        },
      };

      return {
        isValid: false,
        errors: [
          `${paramName} must be of type ${schema.type}, got ${actualType}`,
        ],
        enhancedError,
      };
    }

    return { isValid: true, errors: [] };
  }

  /**
   * Validate string parameter with enhanced error reporting
   */
  private static validateString(
    value: string,
    paramName: string,
    schema: ParameterConstraints,
    tool: string
  ): ValidationResult & { enhancedError?: EnhancedError } {
    const trimmedValue = value.trim();
    const errors: string[] = [];

    // Length validation
    if (
      schema.minLength !== undefined &&
      trimmedValue.length < schema.minLength
    ) {
      errors.push(
        `${paramName} must be at least ${schema.minLength} characters long`
      );
    }
    if (
      schema.maxLength !== undefined &&
      trimmedValue.length > schema.maxLength
    ) {
      errors.push(
        `${paramName} must be at most ${schema.maxLength} characters long`
      );
    }

    // Pattern validation
    if (schema.pattern && !schema.pattern.test(trimmedValue)) {
      errors.push(`${paramName} does not match the required pattern`);
    }

    // Empty string validation
    if (trimmedValue.length === 0 && schema.required) {
      errors.push(`${paramName} cannot be empty`);
    }

    if (errors.length > 0) {
      const enhancedError: EnhancedError = {
        error: true,
        message: `Invalid value for parameter '${paramName}': ${errors.join(', ')}`,
        tool,
        errorType: ErrorType.PARAMETER_INVALID,
        timestamp: new Date().toISOString(),
        solution: {
          description: `Provide a valid value for '${paramName}'`,
          steps: [
            schema.minLength !== undefined
              ? `Ensure the value is at least ${schema.minLength} characters`
              : '',
            schema.maxLength !== undefined
              ? `Ensure the value is at most ${schema.maxLength} characters`
              : '',
            schema.pattern
              ? `Match the required pattern: ${schema.pattern.source}`
              : '',
            'Use one of the examples provided',
          ].filter(Boolean),
          examples: schema.examples,
        },
        allowed_values: {
          [paramName]: {
            type: 'string',
            pattern: schema.pattern?.source,
            examples: schema.examples,
          },
        },
        validation_errors: errors,
        recovery_hints: {
          retry_recommended: true,
        },
      };

      return {
        isValid: false,
        errors,
        enhancedError,
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: trimmedValue,
    };
  }

  /**
   * Validate number parameter with enhanced error reporting
   */
  private static validateNumber(
    value: number,
    paramName: string,
    schema: ParameterConstraints,
    tool: string
  ): ValidationResult & { enhancedError?: EnhancedError } {
    const errors: string[] = [];

    // Finite number check
    if (!Number.isFinite(value)) {
      errors.push(`${paramName} must be a finite number`);
    }

    // Integer check
    if (schema.integer && !Number.isInteger(value)) {
      errors.push(`${paramName} must be an integer`);
    }

    // Range validation
    if (schema.min !== undefined && value < schema.min) {
      errors.push(`${paramName} must be at least ${schema.min}`);
    }
    if (schema.max !== undefined && value > schema.max) {
      errors.push(`${paramName} must be at most ${schema.max}`);
    }

    if (errors.length > 0) {
      const enhancedError: EnhancedError = {
        error: true,
        message: `Invalid value for parameter '${paramName}': ${errors.join(', ')}`,
        tool,
        errorType: ErrorType.PARAMETER_OUT_OF_RANGE,
        timestamp: new Date().toISOString(),
        solution: {
          description: `Provide a valid numeric value for '${paramName}'`,
          steps: [
            'Ensure the value is a finite number',
            schema.integer ? 'Use an integer value (no decimal places)' : '',
            schema.min !== undefined ? `Use a value >= ${schema.min}` : '',
            schema.max !== undefined ? `Use a value <= ${schema.max}` : '',
            'Refer to the examples for valid values',
          ].filter(Boolean),
          examples: schema.examples,
        },
        allowed_values: {
          [paramName]: {
            type: 'number',
            range:
              schema.min !== undefined && schema.max !== undefined
                ? { min: schema.min, max: schema.max }
                : undefined,
            examples: schema.examples,
          },
        },
        validation_errors: errors,
        recovery_hints: {
          retry_recommended: true,
        },
      };

      return {
        isValid: false,
        errors,
        enhancedError,
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: value,
    };
  }

  /**
   * Validate boolean parameter with enhanced error reporting
   */
  private static validateBoolean(
    value: unknown,
    paramName: string,
    _schema: ParameterConstraints,
    tool: string
  ): ValidationResult & { enhancedError?: EnhancedError } {
    // Handle string representations of booleans
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase().trim();
      if (['true', '1', 'yes', 'on'].includes(lowerValue)) {
        return { isValid: true, errors: [], sanitizedValue: true };
      }
      if (['false', '0', 'no', 'off'].includes(lowerValue)) {
        return { isValid: true, errors: [], sanitizedValue: false };
      }
    }

    if (typeof value === 'boolean') {
      return { isValid: true, errors: [], sanitizedValue: value };
    }

    const enhancedError: EnhancedError = {
      error: true,
      message: `Parameter '${paramName}' must be a boolean value`,
      tool,
      errorType: ErrorType.PARAMETER_INVALID,
      timestamp: new Date().toISOString(),
      solution: {
        description: `Provide a valid boolean value for '${paramName}'`,
        steps: [
          'Use true or false as the value',
          'String representations like "true", "false", "1", "0" are also accepted',
          'Ensure the value is properly formatted',
        ],
        examples: ['true', 'false', '"true"', '"false"', '1', '0'],
      },
      allowed_values: {
        [paramName]: {
          type: 'boolean',
          values: ['true', 'false'],
          examples: ['true', 'false'],
        },
      },
      recovery_hints: {
        retry_recommended: true,
      },
    };

    return {
      isValid: false,
      errors: [`${paramName} must be a boolean value`],
      enhancedError,
    };
  }

  /**
   * Validate enum parameter with enhanced error reporting
   */
  private static validateEnum(
    value: string,
    paramName: string,
    schema: ParameterConstraints,
    tool: string
  ): ValidationResult & { enhancedError?: EnhancedError } {
    if (!schema.allowedValues) {
      return { isValid: true, errors: [], sanitizedValue: value };
    }

    const trimmedValue = value.trim();
    const allowedValues = schema.allowedValues as string[];

    if (!allowedValues.includes(trimmedValue)) {
      const enhancedError: EnhancedError = {
        error: true,
        message: `Invalid value for parameter '${paramName}': '${trimmedValue}'`,
        tool,
        errorType: ErrorType.PARAMETER_INVALID,
        timestamp: new Date().toISOString(),
        solution: {
          description: `Use one of the allowed values for '${paramName}'`,
          steps: [
            `Choose one of the valid options: ${allowedValues.join(', ')}`,
            'Ensure the value matches exactly (case-sensitive)',
            'Remove any extra whitespace around the value',
          ],
          examples: allowedValues,
        },
        allowed_values: {
          [paramName]: {
            type: 'enum',
            values: allowedValues,
            examples: allowedValues,
          },
        },
        recovery_hints: {
          retry_recommended: true,
        },
      };

      return {
        isValid: false,
        errors: [`${paramName} must be one of: ${allowedValues.join(', ')}`],
        enhancedError,
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: trimmedValue,
    };
  }

  /**
   * Validate array parameter with enhanced error reporting
   */
  private static validateArray(
    value: unknown[],
    paramName: string,
    schema: ParameterConstraints,
    tool: string
  ): ValidationResult & { enhancedError?: EnhancedError } {
    const errors: string[] = [];

    // Length validation
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${paramName} must have at least ${schema.minItems} items`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(`${paramName} must have at most ${schema.maxItems} items`);
    }

    if (errors.length > 0) {
      const enhancedError: EnhancedError = {
        error: true,
        message: `Invalid array for parameter '${paramName}': ${errors.join(', ')}`,
        tool,
        errorType: ErrorType.PARAMETER_INVALID,
        timestamp: new Date().toISOString(),
        solution: {
          description: `Provide a valid array for '${paramName}'`,
          steps: [
            schema.minItems !== undefined
              ? `Include at least ${schema.minItems} items`
              : '',
            schema.maxItems !== undefined
              ? `Include at most ${schema.maxItems} items`
              : '',
            'Ensure all items are of the correct type',
            'Use the examples as a guide',
          ].filter(Boolean),
          examples: schema.examples,
        },
        allowed_values: {
          [paramName]: {
            type: 'array',
            examples: schema.examples,
          },
        },
        validation_errors: errors,
        recovery_hints: {
          retry_recommended: true,
        },
      };

      return {
        isValid: false,
        errors,
        enhancedError,
      };
    }

    return {
      isValid: true,
      errors: [],
      sanitizedValue: value,
    };
  }
}

/**
 * Common parameter schemas for reuse across tools
 */
export const CommonParameterSchemas: Record<string, ParameterConstraints> = {
  limit: {
    type: 'number',
    required: true,
    description: 'Maximum number of results to return',
    min: 1,
    max: 10000,
    integer: true,
    examples: ['100', '500', '1000'],
    invalidExamples: [
      { value: '0', reason: 'Limit must be at least 1' },
      { value: '10001', reason: 'Limit cannot exceed 10,000' },
      { value: '1.5', reason: 'Limit must be an integer' },
    ],
  },

  query: {
    type: 'string',
    required: true,
    description: 'Search query using Firewalla query syntax',
    minLength: 1,
    maxLength: 2000,
    examples: [
      'severity:high',
      'protocol:tcp AND blocked:true',
      'source_ip:192.168.* OR destination_ip:10.0.*',
    ],
    invalidExamples: [
      { value: '', reason: 'Query cannot be empty' },
      { value: '*', reason: 'Wildcard-only queries are not supported' },
    ],
  },

  cursor: {
    type: 'string',
    required: false,
    description: 'Pagination cursor from previous response',
    maxLength: 1000,
    pattern: /^[A-Za-z0-9+/=_-]+$/,
    examples: ['eyJsaW1pdCI6MTAwfQ==', 'cursor_abc123def456'],
    invalidExamples: [
      {
        value: 'invalid cursor!',
        reason: 'Cursor contains invalid characters',
      },
    ],
  },

  severity: {
    type: 'enum',
    required: false,
    description: 'Filter by alarm severity level',
    allowedValues: ['low', 'medium', 'high', 'critical'],
    examples: ['high', 'critical', 'medium'],
    invalidExamples: [
      { value: 'urgent', reason: 'Not a valid severity level' },
    ],
  },

  rule_id: {
    type: 'string',
    required: true,
    description: 'Unique identifier for the firewall rule',
    minLength: 1,
    maxLength: 64,
    pattern: /^[a-zA-Z0-9_-]+$/,
    examples: [
      'rule_block_facebook',
      'abc123def456',
      '550e8400-e29b-41d4-a716-446655440000',
    ],
    invalidExamples: [
      { value: '', reason: 'Rule ID cannot be empty' },
      { value: 'rule with spaces', reason: 'Rule ID cannot contain spaces' },
    ],
  },

  period: {
    type: 'enum',
    required: false,
    description: 'Time period for analysis',
    allowedValues: ['1h', '24h', '7d', '30d'],
    examples: ['24h', '7d', '1h'],
    invalidExamples: [
      { value: '1day', reason: 'Use format like "24h", "7d", "30d"' },
    ],
  },
};

/**
 * Generate enhanced error for missing tool
 */
export function createToolNotFoundError(
  toolName: string,
  availableTools: string[]
): {
  content: Array<{ type: string; text: string }>;
  isError: true;
} {
  const enhancedError: EnhancedError = {
    error: true,
    message: `Tool '${toolName}' not found`,
    tool: toolName,
    errorType: ErrorType.UNKNOWN_ERROR,
    timestamp: new Date().toISOString(),
    solution: {
      description: 'Use a valid tool name from the available tools list',
      steps: [
        'Check the spelling of the tool name',
        'Use one of the available tools listed below',
        'Ensure the tool is enabled in the current configuration',
      ],
      examples: availableTools.slice(0, 5),
    },
    allowed_values: {
      tool_name: {
        type: 'enum',
        values: availableTools,
        examples: availableTools.slice(0, 10),
      },
    },
    details: {
      available_tools: availableTools,
      total_available: availableTools.length,
    },
    recovery_hints: {
      retry_recommended: true,
      alternative_tools: availableTools.slice(0, 3),
    },
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(enhancedError, null, 2),
      },
    ],
    isError: true,
  };
}

/**
 * Backward compatibility: Create legacy error response format
 * @deprecated Use createEnhancedErrorResponse instead
 */
export function createErrorResponse(
  tool: string,
  message: string,
  errorType?: ErrorType,
  details?: Record<string, unknown>,
  validationErrors?: string[]
): {
  content: Array<{ type: string; text: string }>;
  isError: true;
} {
  return createEnhancedErrorResponse(
    tool,
    message,
    errorType || ErrorType.UNKNOWN_ERROR,
    {
      details,
      validation_errors: validationErrors,
    }
  );
}
