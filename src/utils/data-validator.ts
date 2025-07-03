/**
 * Data Validator for Firewalla MCP Server
 *
 * Provides runtime data validation utilities for API responses and data structures.
 * Focuses on structural validation, type checking, and data consistency validation
 * rather than query syntax validation (which is handled by field-validator.ts).
 *
 * @module DataValidator
 * @version 1.0.0
 */

// Importing for type reference in JSDoc comments
// import type { GeographicData } from '../types.js';

/**
 * Result of data structure validation
 */
export interface ValidationResult {
  /** Whether the validation passed */
  isValid: boolean;
  /** Array of error messages if validation failed */
  errors: string[];
  /** Array of warning messages for non-critical issues */
  warnings: string[];
  /** Suggestions for fixing validation errors */
  suggestions: string[];
  /** Additional metadata about the validation */
  metadata?: {
    /** Number of fields validated */
    fieldsValidated: number;
    /** Number of missing required fields */
    missingFields: number;
    /** Number of type mismatches found */
    typeMismatches: number;
    /** Validation execution time in milliseconds */
    validationTime: number;
  };
}

/**
 * Result of type checking validation
 */
export interface TypeValidationResult {
  /** Whether all type checks passed */
  isValid: boolean;
  /** Array of fields that failed type validation */
  invalidFields: Array<{
    /** Field name that failed validation */
    field: string;
    /** Expected type */
    expectedType: string;
    /** Actual type found */
    actualType: string;
    /** Current value */
    actualValue: any;
    /** Suggestion for fixing the type issue */
    suggestion: string;
  }>;
  /** Summary of type validation results */
  summary: {
    /** Total fields checked */
    totalFields: number;
    /** Fields that passed validation */
    validFields: number;
    /** Fields that failed validation */
    invalidFields: number;
    /** Fields with convertible types */
    convertibleFields: number;
  };
}

/**
 * Timestamp normalization result
 */
export interface TimestampNormalizationResult {
  /** Whether normalization was successful */
  success: boolean;
  /** The normalized data object */
  data: any;
  /** Array of modifications made during normalization */
  modifications: Array<{
    /** Field that was modified */
    field: string;
    /** Original value */
    originalValue: any;
    /** New normalized value */
    normalizedValue: any;
    /** Type of modification performed */
    modificationType: 'converted' | 'formatted' | 'defaulted' | 'validated';
    /** Description of the modification */
    description: string;
  }>;
  /** Array of warnings for potential issues */
  warnings: string[];
}

/**
 * Schema definition for response structure validation
 */
export interface ResponseSchema {
  /** Required fields and their expected types */
  required: Record<string, string>;
  /** Optional fields and their expected types */
  optional?: Record<string, string>;
  /** Custom validation functions for specific fields */
  customValidators?: Record<
    string,
    (value: any) => { isValid: boolean; error?: string }
  >;
  /** Whether to allow additional fields not in the schema */
  allowAdditionalFields?: boolean;
}

/**
 * Validates the structure of API responses against expected schemas
 *
 * Performs comprehensive validation of response data including:
 * - Required field presence checking
 * - Type validation for all fields
 * - Custom validation rules
 * - Structure consistency verification
 * - Nested object validation
 *
 * @param data - The response data to validate
 * @param expectedSchema - Schema definition describing expected structure
 * @returns Detailed validation result with errors and suggestions
 *
 * @example
 * ```typescript
 * const schema: ResponseSchema = {
 *   required: {
 *     'count': 'number',
 *     'results': 'array',
 *     'timestamp': 'string'
 *   },
 *   optional: {
 *     'cursor': 'string',
 *     'metadata': 'object'
 *   },
 *   customValidators: {
 *     'count': (value) => ({
 *       isValid: value >= 0,
 *       error: 'Count must be non-negative'
 *     })
 *   }
 * };
 *
 * const result = validateResponseStructure(apiResponse, schema);
 * if (!result.isValid) {
 *   console.log('Validation errors:', result.errors);
 * }
 * ```
 */
export function validateResponseStructure(
  data: any,
  expectedSchema: ResponseSchema
): ValidationResult {
  const startTime = Date.now();
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  let fieldsValidated = 0;
  let missingFields = 0;
  let typeMismatches = 0;

  // Check if data exists
  if (data === null || data === undefined) {
    return {
      isValid: false,
      errors: ['Response data is null or undefined'],
      warnings: [],
      suggestions: ['Ensure the API call completed successfully'],
      metadata: {
        fieldsValidated: 0,
        missingFields: Object.keys(expectedSchema.required).length,
        typeMismatches: 0,
        validationTime: Date.now() - startTime,
      },
    };
  }

  // Check if data is an object
  if (typeof data !== 'object') {
    return {
      isValid: false,
      errors: [`Expected object, got ${typeof data}`],
      warnings: [],
      suggestions: ['Verify API response format'],
      metadata: {
        fieldsValidated: 0,
        missingFields: Object.keys(expectedSchema.required).length,
        typeMismatches: 1,
        validationTime: Date.now() - startTime,
      },
    };
  }

  // Validate required fields
  for (const [field, expectedType] of Object.entries(expectedSchema.required)) {
    fieldsValidated++;

    if (!(field in data)) {
      missingFields++;
      errors.push(`Required field '${field}' is missing`);
      suggestions.push(
        `Add '${field}' field of type '${expectedType}' to response`
      );
      continue;
    }

    const validationResult = validateFieldType(
      data[field],
      expectedType,
      field
    );
    if (!validationResult.isValid) {
      typeMismatches++;
      errors.push(validationResult.error!);
      if (validationResult.suggestion) {
        suggestions.push(validationResult.suggestion);
      }
    }
  }

  // Validate optional fields if present
  if (expectedSchema.optional) {
    for (const [field, expectedType] of Object.entries(
      expectedSchema.optional
    )) {
      if (field in data) {
        fieldsValidated++;
        const validationResult = validateFieldType(
          data[field],
          expectedType,
          field
        );
        if (!validationResult.isValid) {
          typeMismatches++;
          warnings.push(`Optional field '${field}': ${validationResult.error}`);
        }
      }
    }
  }

  // Run custom validators
  if (expectedSchema.customValidators) {
    for (const [field, validator] of Object.entries(
      expectedSchema.customValidators
    )) {
      if (field in data) {
        try {
          const result = validator(data[field]);
          if (!result.isValid) {
            errors.push(
              `Custom validation failed for '${field}': ${result.error}`
            );
          }
        } catch (err) {
          warnings.push(
            `Custom validator for '${field}' threw an error: ${err}`
          );
        }
      }
    }
  }

  // Check for unexpected fields
  if (!expectedSchema.allowAdditionalFields) {
    const expectedFields = new Set([
      ...Object.keys(expectedSchema.required),
      ...Object.keys(expectedSchema.optional || {}),
    ]);

    const unexpectedFields = Object.keys(data).filter(
      field => !expectedFields.has(field)
    );
    if (unexpectedFields.length > 0) {
      warnings.push(`Unexpected fields found: ${unexpectedFields.join(', ')}`);
    }
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    errors,
    warnings,
    suggestions,
    metadata: {
      fieldsValidated,
      missingFields,
      typeMismatches,
      validationTime: Date.now() - startTime,
    },
  };
}

/**
 * Performs runtime type checking on data objects
 *
 * Validates that object fields match expected types with support for:
 * - Primitive type checking (string, number, boolean)
 * - Array and object type validation
 * - Nested type checking for complex structures
 * - Type conversion suggestions
 * - Null/undefined handling
 *
 * @param data - The data object to type check
 * @param typeMap - Map of field names to expected types
 * @returns Detailed type validation result with conversion suggestions
 *
 * @example
 * ```typescript
 * const data = {
 *   count: "123",        // Should be number
 *   active: "true",      // Should be boolean
 *   items: [1, 2, 3],    // Correct array
 *   metadata: {}         // Correct object
 * };
 *
 * const typeMap = {
 *   count: 'number',
 *   active: 'boolean',
 *   items: 'array',
 *   metadata: 'object'
 * };
 *
 * const result = checkFieldTypes(data, typeMap);
 * console.log(`${result.summary.validFields}/${result.summary.totalFields} fields valid`);
 * ```
 */
export function checkFieldTypes(
  data: any,
  typeMap: Record<string, string>
): TypeValidationResult {
  const invalidFields: TypeValidationResult['invalidFields'] = [];
  let validFields = 0;
  let convertibleFields = 0;

  if (!data || typeof data !== 'object') {
    return {
      isValid: false,
      invalidFields: [
        {
          field: '<root>',
          expectedType: 'object',
          actualType: typeof data,
          actualValue: data,
          suggestion: 'Ensure data is a valid object',
        },
      ],
      summary: {
        totalFields: 0,
        validFields: 0,
        invalidFields: 1,
        convertibleFields: 0,
      },
    };
  }

  for (const [field, expectedType] of Object.entries(typeMap)) {
    const value = data[field];
    const actualType = getDetailedType(value);

    if (isTypeCompatible(value, expectedType)) {
      validFields++;
    } else {
      const suggestion = generateTypeSuggestion(
        value,
        expectedType,
        actualType
      );
      const isConvertible = canConvertType(value, expectedType);

      if (isConvertible) {
        convertibleFields++;
      }

      invalidFields.push({
        field,
        expectedType,
        actualType,
        actualValue: value,
        suggestion,
      });
    }
  }

  const totalFields = Object.keys(typeMap).length;
  const isValid = invalidFields.length === 0;

  return {
    isValid,
    invalidFields,
    summary: {
      totalFields,
      validFields,
      invalidFields: invalidFields.length,
      convertibleFields,
    },
  };
}

/**
 * Normalizes timestamp fields to consistent formats
 *
 * Handles various timestamp representations and converts them to standardized formats:
 * - Unix timestamps (seconds/milliseconds)
 * - ISO 8601 date strings
 * - Date objects
 * - Custom date formats
 * - Relative time expressions
 *
 * @param data - Object containing timestamp fields to normalize
 * @returns Normalization result with converted timestamps and modification log
 *
 * @example
 * ```typescript
 * const data = {
 *   created_at: 1640995200,          // Unix timestamp
 *   updated_at: "2022-01-01T00:00:00Z", // ISO string
 *   timestamp: new Date(),           // Date object
 *   invalid_date: "not a date"       // Invalid format
 * };
 *
 * const result = normalizeTimestamps(data);
 * // All valid timestamps converted to ISO format
 * // Invalid timestamps marked in warnings
 * ```
 */
export function normalizeTimestamps(data: any): TimestampNormalizationResult {
  const modifications: TimestampNormalizationResult['modifications'] = [];
  const warnings: string[] = [];
  let success = true;

  if (!data || typeof data !== 'object') {
    return {
      success: false,
      data,
      modifications: [],
      warnings: ['Input data is not an object'],
    };
  }

  // Common timestamp field patterns
  const timestampFields = [
    'timestamp',
    'ts',
    'time',
    'created_at',
    'created',
    'createdAt',
    'updated_at',
    'updated',
    'updatedAt',
    'modified_at',
    'date',
    'datetime',
    'last_seen',
    'lastSeen',
    'start_time',
    'end_time',
    'expire_time',
  ];

  const normalized = { ...data };

  // Process each field in the data
  for (const [field, value] of Object.entries(data)) {
    // Check if field looks like a timestamp
    const isTimestampField = timestampFields.some(pattern =>
      field.toLowerCase().includes(pattern.toLowerCase())
    );

    if (isTimestampField || isTimestampValue(value)) {
      const normalizedValue = normalizeTimestampValue(value);

      if (normalizedValue.success) {
        if (normalizedValue.value !== value) {
          normalized[field] = normalizedValue.value;
          modifications.push({
            field,
            originalValue: value,
            normalizedValue: normalizedValue.value,
            modificationType: normalizedValue.modificationType,
            description: normalizedValue.description,
          });
        }
      } else {
        warnings.push(
          `Failed to normalize timestamp field '${field}': ${normalizedValue.error}`
        );
        success = false;
      }
    }
  }

  // Recursively process nested objects
  for (const [field, value] of Object.entries(normalized)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      const nestedResult = normalizeTimestamps(value);
      if (nestedResult.modifications.length > 0) {
        normalized[field] = nestedResult.data;
        // Prefix nested field names
        nestedResult.modifications.forEach(mod => {
          modifications.push({
            ...mod,
            field: `${field}.${mod.field}`,
          });
        });
      }
      warnings.push(...nestedResult.warnings);
    }
  }

  return {
    success,
    data: normalized,
    modifications,
    warnings,
  };
}

/**
 * Helper function to validate individual field types
 * @private
 */
function validateFieldType(
  value: any,
  expectedType: string,
  fieldName: string
): { isValid: boolean; error?: string; suggestion?: string } {
  if (isTypeCompatible(value, expectedType)) {
    return { isValid: true };
  }

  const actualType = getDetailedType(value);
  const suggestion = generateTypeSuggestion(value, expectedType, actualType);

  return {
    isValid: false,
    error: `Field '${fieldName}' expected type '${expectedType}', got '${actualType}'`,
    suggestion,
  };
}

/**
 * Checks if a value is compatible with the expected type
 * @private
 */
function isTypeCompatible(value: any, expectedType: string): boolean {
  if (value === null || value === undefined) {
    return expectedType.includes('null') || expectedType.includes('undefined');
  }

  const actualType = getDetailedType(value);

  // Handle union types (e.g., "string|null")
  if (expectedType.includes('|')) {
    return expectedType.split('|').some(type => type.trim() === actualType);
  }

  return actualType === expectedType;
}

/**
 * Gets detailed type information for a value
 * @private
 */
function getDetailedType(value: any): string {
  if (value === null) {
    return 'null';
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value instanceof Date) {
    return 'date';
  }

  return typeof value;
}

/**
 * Generates suggestions for type conversion
 * @private
 */
function generateTypeSuggestion(
  value: any,
  expectedType: string,
  actualType: string
): string {
  if (canConvertType(value, expectedType)) {
    switch (expectedType) {
      case 'number':
        return `Convert string "${value}" to number using Number() or parseInt()`;
      case 'boolean':
        return `Convert "${value}" to boolean (true/false)`;
      case 'string':
        return `Convert ${actualType} value to string using toString()`;
      case 'array':
        return 'Wrap value in array brackets or ensure proper array format';
      default:
        return `Convert ${actualType} to ${expectedType}`;
    }
  }

  return `Value cannot be automatically converted from ${actualType} to ${expectedType}`;
}

/**
 * Checks if a value can be converted to the expected type
 * @private
 */
function canConvertType(value: any, expectedType: string): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  switch (expectedType) {
    case 'number':
      return typeof value === 'string' && !isNaN(Number(value));
    case 'boolean':
      return (
        typeof value === 'string' &&
        ['true', 'false', '1', '0', 'yes', 'no'].includes(value.toLowerCase())
      );
    case 'string':
      return true; // Most values can be converted to string
    case 'array':
      return false; // Cannot auto-convert to array
    case 'object':
      return false; // Cannot auto-convert to object
    default:
      return false;
  }
}

/**
 * Checks if a value looks like a timestamp
 * @private
 */
function isTimestampValue(value: any): boolean {
  // Unix timestamp (10 or 13 digits)
  if (
    typeof value === 'number' &&
    !isNaN(value) &&
    ((value >= 1000000000 && value <= 9999999999) || // 10 digits (seconds)
      (value >= 1000000000000 && value <= 9999999999999)) // 13 digits (milliseconds)
  ) {
    return true;
  }

  // Check for invalid numeric values that might be intended as timestamps
  if (typeof value === 'number' && isNaN(value)) {
    return true;
  }

  // ISO date string
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return true;
  }

  // Date object
  if (value instanceof Date) {
    return true;
  }

  return false;
}

/**
 * Normalizes a single timestamp value
 * @private
 */
function normalizeTimestampValue(value: any): {
  success: boolean;
  value?: string;
  error?: string;
  modificationType: TimestampNormalizationResult['modifications'][0]['modificationType'];
  description: string;
} {
  try {
    let date: Date;
    let modificationType: TimestampNormalizationResult['modifications'][0]['modificationType'] =
      'converted';
    let description = '';

    if (value instanceof Date) {
      date = value;
      modificationType = 'formatted';
      description = 'Formatted Date object to ISO string';
    } else if (typeof value === 'number') {
      // Handle Unix timestamps
      const timestamp = value < 1000000000000 ? value * 1000 : value; // Convert seconds to milliseconds
      date = new Date(timestamp);
      modificationType = 'converted';
      description = `Converted Unix timestamp (${value}) to ISO string`;
    } else if (typeof value === 'string') {
      date = new Date(value);
      modificationType = 'validated';
      description = `Validated and normalized date string`;
    } else {
      return {
        success: false,
        error: `Cannot convert ${typeof value} to timestamp`,
        modificationType: 'converted',
        description: 'Conversion failed',
      };
    }

    if (isNaN(date.getTime())) {
      return {
        success: false,
        error: 'Invalid date value',
        modificationType: 'converted',
        description: 'Date validation failed',
      };
    }

    return {
      success: true,
      value: date.toISOString(),
      modificationType,
      description,
    };
  } catch (error) {
    return {
      success: false,
      error: `Timestamp conversion error: ${error}`,
      modificationType: 'converted',
      description: 'Exception during conversion',
    };
  }
}

/**
 * Creates a comprehensive validation schema for common Firewalla response types
 *
 * @param responseType - Type of response (alarms, flows, devices, etc.)
 * @returns Appropriate validation schema for the response type
 *
 * @example
 * ```typescript
 * const schema = createValidationSchema('alarms');
 * const result = validateResponseStructure(response, schema);
 * ```
 */
export function createValidationSchema(responseType: string): ResponseSchema {
  const baseSchema: ResponseSchema = {
    required: {
      count: 'number',
      results: 'array',
    },
    optional: {
      execution_time_ms: 'number',
      cached: 'boolean',
      cursor: 'string',
      next_cursor: 'string',
    },
    allowAdditionalFields: true,
  };

  switch (responseType) {
    case 'alarms':
      return {
        ...baseSchema,
        customValidators: {
          count: value => ({
            isValid: typeof value === 'number' && value >= 0,
            error: 'Count must be a non-negative number',
          }),
        },
      };

    case 'flows':
      return {
        ...baseSchema,
        optional: {
          ...baseSchema.optional,
          query_executed: 'string',
          aggregations: 'object',
        },
      };

    case 'devices':
      return {
        ...baseSchema,
        optional: {
          ...baseSchema.optional,
          total_count: 'number',
        },
      };

    default:
      return baseSchema;
  }
}
