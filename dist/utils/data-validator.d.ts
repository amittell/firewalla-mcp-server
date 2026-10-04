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
/**
 * Consolidated validation result interface used across the application
 */
export interface ValidationResult {
    /** Whether the validation passed */
    isValid: boolean;
    /** Array of error messages if validation failed */
    errors: string[];
    /** Array of warning messages for non-critical issues */
    warnings?: string[];
    /** Suggestions for fixing validation errors */
    suggestions?: string[];
    /** Sanitized/validated value (if applicable) */
    sanitizedValue?: unknown;
    /** Additional metadata about the validation */
    metadata?: {
        /** Number of fields validated */
        fieldsValidated?: number;
        /** Number of missing required fields */
        missingFields?: number;
        /** Number of type mismatches found */
        typeMismatches?: number;
        /** Validation execution time in milliseconds */
        validationTime?: number;
    };
}
/**
 * Result of type checking validation
 * Compatible with main ValidationResult interface
 */
export interface TypeValidationResult {
    /** Whether all type checks passed */
    isValid: boolean;
    /** Array of error messages if validation failed */
    errors: string[];
    /** Array of warning messages for non-critical issues */
    warnings?: string[];
    /** Suggestions for fixing validation errors */
    suggestions?: string[];
    /** Sanitized/validated value (if applicable) */
    sanitizedValue?: unknown;
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
    /** Additional metadata about the validation */
    metadata?: {
        /** Number of fields validated */
        fieldsValidated?: number;
        /** Number of missing required fields */
        missingFields?: number;
        /** Number of type mismatches found */
        typeMismatches?: number;
        /** Validation execution time in milliseconds */
        validationTime?: number;
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
    customValidators?: Record<string, (value: any) => {
        isValid: boolean;
        error?: string;
    }>;
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
export declare function validateResponseStructure(data: any, expectedSchema: ResponseSchema): ValidationResult;
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
export declare function checkFieldTypes(data: any, typeMap: Record<string, string>): TypeValidationResult;
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
export declare function normalizeTimestamps(data: any): TimestampNormalizationResult;
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
export declare function createValidationSchema(responseType: string): ResponseSchema;
//# sourceMappingURL=data-validator.d.ts.map