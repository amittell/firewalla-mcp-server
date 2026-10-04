/**
 * Centralized Error Handling and Validation for Firewalla MCP Server
 * Provides consistent error responses and comprehensive validation utilities
 */
import { FieldValidator } from './field-validator.js';
import { pathSegmentProblem } from './path-segment.js';
import { queryComplexityErrors, queryStructureErrors, } from '../utils/query-structure.js';
import { RATE_LIMIT_TEXT } from '../firewalla/rate-limit.js';
/**
 * Enumeration of specific error types for better error categorization
 */
export var ErrorType;
(function (ErrorType) {
    ErrorType["VALIDATION_ERROR"] = "validation_error";
    ErrorType["AUTHENTICATION_ERROR"] = "authentication_error";
    ErrorType["API_ERROR"] = "api_error";
    ErrorType["NETWORK_ERROR"] = "network_error";
    ErrorType["TIMEOUT_ERROR"] = "timeout_error";
    ErrorType["RATE_LIMIT_ERROR"] = "rate_limit_error";
    ErrorType["CACHE_ERROR"] = "cache_error";
    ErrorType["CORRELATION_ERROR"] = "correlation_error";
    ErrorType["SEARCH_ERROR"] = "search_error";
    ErrorType["SERVICE_UNAVAILABLE"] = "service_unavailable";
    ErrorType["TOOL_DISABLED"] = "tool_disabled";
    ErrorType["UNKNOWN_ERROR"] = "unknown_error";
})(ErrorType || (ErrorType = {}));
/** The kinds a handler passes for any failure, which a rate limit overrides */
const GENERIC_ERROR_TYPES = new Set([
    ErrorType.API_ERROR,
    ErrorType.SEARCH_ERROR,
    ErrorType.NETWORK_ERROR,
    ErrorType.UNKNOWN_ERROR,
]);
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
export function createErrorResponse(tool, message, errorType = ErrorType.UNKNOWN_ERROR, details, validationErrors, context) {
    // A rate-limit refusal is a rate_limit_error whatever kind the handler
    // passed for its failures in general; a more specific kind is kept
    const kind = GENERIC_ERROR_TYPES.has(errorType) && RATE_LIMIT_TEXT.test(message)
        ? ErrorType.RATE_LIMIT_ERROR
        : errorType;
    const errorResponse = {
        error: true,
        message,
        tool,
        errorType: kind,
        timestamp: new Date().toISOString(),
        ...(details && { details }),
        ...(validationErrors?.length && { validation_errors: validationErrors }),
        ...(context && { context })
    };
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(errorResponse),
            },
        ],
        isError: true,
    };
}
/**
 * The refusal every tool that takes a query gives one that fails the
 * structural checks (queryStructureErrors) or goes over a complexity limit
 * (queryComplexityErrors), before it translates or sends it; undefined
 * when the query passes, or is not a string. search_* (through
 * validateCommonSearchParameters), get_flow_data, get_active_alarms and
 * get_network_rules all run it, so they refuse a query alike.
 *
 * @param tool - The tool's name, for the response
 * @param query - The query argument as given
 */
export function queryShapeRefusal(tool, query) {
    if (typeof query !== 'string') {
        return undefined;
    }
    const structureErrors = queryStructureErrors(query);
    if (structureErrors.length > 0) {
        return createErrorResponse(tool, 'Invalid query structure', ErrorType.VALIDATION_ERROR, { query, structure_errors: structureErrors }, structureErrors);
    }
    const complexityErrors = queryComplexityErrors(query);
    if (complexityErrors.length > 0) {
        return createErrorResponse(tool, 'Query is too complex', ErrorType.VALIDATION_ERROR, {
            query,
            complexity_errors: complexityErrors,
            hint: 'Split it into several searches',
        }, complexityErrors);
    }
    return undefined;
}
/**
 * Create a legacy error response for backward compatibility
 * @deprecated Use createErrorResponse with ErrorType instead
 */
export function createLegacyErrorResponse(tool, message, details, validationErrors) {
    return createErrorResponse(tool, message, ErrorType.UNKNOWN_ERROR, details, validationErrors);
}
/**
 * Wrap a function to ensure consistent error handling
 */
export function wrapTool(toolName, fn) {
    return async (...args) => {
        try {
            return await fn(...args);
        }
        catch (error) {
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
    static validateRequiredString(value, paramName) {
        // Enhanced null/undefined handling with consistent normalization
        if (value === undefined || value === null) {
            return {
                isValid: false,
                errors: [
                    `${paramName} is required but was not provided`,
                    `Please provide a valid string value for ${paramName}`
                ]
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
    static validateOptionalString(value, paramName) {
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
    static validateNumber(value, paramName, options = {}) {
        const { required = false, min, max, defaultValue, integer = false } = options;
        // Enhanced null/undefined handling with consistent normalization
        if (value === undefined || value === null) {
            if (required) {
                const contextHint = min !== undefined && max !== undefined
                    ? ` (valid range: ${min}-${max})`
                    : min !== undefined
                        ? ` (minimum: ${min})`
                        : max !== undefined
                            ? ` (maximum: ${max})`
                            : '';
                return {
                    isValid: false,
                    errors: [
                        `${paramName} is required but was not provided`,
                        `Please provide a numeric value for ${paramName}${contextHint}`
                    ]
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
        let numValue;
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
        }
        else if (typeof value === 'boolean') {
            // Explicitly reject boolean values to prevent implicit conversion
            return {
                isValid: false,
                errors: [`${paramName} must be a number, got boolean`]
            };
        }
        else if (typeof value === 'number') {
            numValue = value;
        }
        else {
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
    static validateEnum(value, paramName, allowedValues, required = false, defaultValue) {
        // Enhanced null/undefined handling with consistent normalization
        if (value === undefined || value === null) {
            if (required) {
                return {
                    isValid: false,
                    errors: [
                        `${paramName} is required but was not provided`,
                        `Please select one of the following values for ${paramName}: ${allowedValues.join(', ')}`
                    ]
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
    static validateBoolean(value, paramName, defaultValue) {
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
    static combineValidationResults(results) {
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
    static getContextualBoundaryMessage(paramName, value, min, max, violationType = 'minimum') {
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
    static validateDateFormat(value, paramName, required = false) {
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
     * Validate an ID that goes into a request path as one segment: a
     * target-list id, rule id, alarm id, box gid or device id. The value is
     * checked as given, never trimmed or cleaned, so an ID is refused rather
     * than rewritten into another one: it is refused when it holds `/`, a
     * backslash, `?`, `#`, `%`, whitespace (leading or trailing too) or a
     * control character, or is `.` or `..` (see path-segment.ts). `:` is
     * allowed. With `required` false, a missing or empty value is valid and
     * gives undefined.
     */
    static validatePathSegment(value, paramName, { required = true } = {}) {
        if (!required && (value === undefined || value === null || value === '')) {
            return { isValid: true, errors: [], sanitizedValue: undefined };
        }
        if (typeof value !== 'string') {
            // The usual missing-value and wrong-type messages
            const typeValidation = required
                ? this.validateRequiredString(value, paramName)
                : this.validateOptionalString(value, paramName);
            return { ...typeValidation, errors: typeValidation.errors ?? [] };
        }
        const problem = pathSegmentProblem(value);
        if (problem) {
            return { isValid: false, errors: [`${paramName} ${problem}`] };
        }
        return { isValid: true, errors: [], sanitizedValue: value };
    }
    /**
     * Validate Firewalla rule ID format
     */
    static validateRuleId(value, paramName) {
        // A rule ID goes into the request path: checked as given, not trimmed
        const stringValidation = this.validatePathSegment(value, paramName);
        if (!stringValidation.isValid) {
            return stringValidation;
        }
        const ruleId = stringValidation.sanitizedValue;
        // Firewalla rule IDs are typically UUIDs or alphanumeric strings with specific patterns
        // Common patterns: UUID format, or alphanumeric with specific prefixes
        const validPatterns = [
            /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, // UUID
            /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}:[a-zA-Z0-9_-]+$/i, // Compound box-gid:sequence returned by rule create (canonical MSP form)
            /^rule_[a-zA-Z0-9_-]+$/i, // Rule prefix format
            /^[a-zA-Z0-9_-]{1,64}$/i, // General alphanumeric ID (sequence numbers can be short)
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
    static validateAlarmId(value, paramName) {
        // get_active_alarms and search_alarms return `aid` as a number, so accept
        // the number a client copies from them
        if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
            value = String(value);
        }
        // An alarm ID goes into the request path: checked as given, not trimmed
        const stringValidation = this.validatePathSegment(value, paramName);
        if (!stringValidation.isValid) {
            return stringValidation;
        }
        const alarmId = stringValidation.sanitizedValue;
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
    static validateCursor(value, paramName) {
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
    static getParameterContext(paramName) {
        const contexts = {
            limit: 'to control result set size and prevent memory issues',
            min_hits: 'to filter rules by activity level',
            duration: 'in seconds, how long a scheduled rule stays active',
            hours: 'for time-based filtering',
            interval: 'in seconds for data aggregation',
            fetch_limit: 'to prevent excessive API calls',
            analysis_limit: 'to balance performance and accuracy'
        };
        return contexts[paramName] || '';
    }
    /**
     * Validate array parameter with optional constraints
     */
    static validateArray(value, paramName, options = {}) {
        // Handle required validation
        if (options.required && (value === undefined || value === null)) {
            return {
                isValid: false,
                errors: [`${paramName} is required`]
            };
        }
        // Handle optional arrays
        if (!options.required && (value === undefined || value === null)) {
            return {
                isValid: true,
                errors: [],
                sanitizedValue: []
            };
        }
        // Validate array type
        if (!Array.isArray(value)) {
            return {
                isValid: false,
                errors: [`${paramName} must be an array`]
            };
        }
        // Validate length constraints
        if (options.minLength !== undefined && value.length < options.minLength) {
            return {
                isValid: false,
                errors: [`${paramName} must have at least ${options.minLength} item(s)`]
            };
        }
        if (options.maxLength !== undefined && value.length > options.maxLength) {
            return {
                isValid: false,
                errors: [`${paramName} must have at most ${options.maxLength} item(s)`]
            };
        }
        return {
            isValid: true,
            errors: [],
            sanitizedValue: value
        };
    }
}
/**
 * Enhanced null safety utilities with improved Object conversion prevention
 */
export class SafeAccess {
    /**
     * Safely access nested object properties with enhanced null checking.
     * A null or undefined obj gives defaultValue.
     */
    static getNestedValue(obj, path, defaultValue = undefined) {
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
        let current = obj;
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
    static ensureArray(value, defaultValue = []) {
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
    static ensureObject(value, defaultValue = {}) {
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
                    return value;
                }
                return defaultValue;
            }
            catch {
                return defaultValue;
            }
        }
        return defaultValue;
    }
    /**
     * Safely access array with enhanced null checking
     */
    static safeArrayAccess(array, accessor, defaultValue = undefined) {
        const safeArray = SafeAccess.ensureArray(array);
        if (safeArray.length === 0) {
            return defaultValue;
        }
        // Enhanced error handling with type checking
        try {
            if (typeof accessor !== 'function') {
                return defaultValue;
            }
            return accessor(safeArray);
        }
        catch (_error) {
            // Log error for debugging but don't expose it
            return defaultValue;
        }
    }
    /**
     * Safely process array with enhanced filtering for null/undefined values
     */
    static safeArrayMap(array, mapper, filter = (item) => item !== null && item !== undefined) {
        const safeArray = SafeAccess.ensureArray(array);
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
                }
                catch {
                    return false;
                }
            })
                .map((item, index) => {
                try {
                    return mapper(item, index);
                }
                catch {
                    return null;
                }
            })
                .filter(result => result !== null && result !== undefined);
        }
        catch {
            return [];
        }
    }
    /**
     * Safely filter array with enhanced null/undefined checking
     */
    static safeArrayFilter(array, predicate) {
        const safeArray = SafeAccess.ensureArray(array);
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
            }
            catch {
                return false;
            }
        });
    }
    /**
     * Enhanced type checking utility to prevent Object conversion errors
     */
    static isValidObject(value) {
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
        }
        catch {
            return false;
        }
    }
    /**
     * Enhanced type checking utility for arrays
     */
    static isValidArray(value) {
        return Array.isArray(value);
    }
    /**
     * Safe string conversion with null handling
     */
    static safeToString(value, defaultValue = '') {
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
    static safeToNumber(value, defaultValue = 0) {
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
 * Fields the MSP API has no qualifier for, with what to use instead. They are
 * rejected before the request, which the API would answer with an error.
 */
const UNSUPPORTED_QUERY_FIELDS = {
    alarms: {
        message: 'the MSP API has no message qualifier; search alarm text with an unqualified term, e.g. porn',
        resolved: 'the MSP API has no resolved qualifier; use status:1 (active) or status:2 (archived)',
    },
};
/**
 * Search query sanitization utilities
 */
export class QuerySanitizer {
    /**
     * Sanitize search query to prevent injection attacks and validate basic structure
     */
    static sanitizeSearchQuery(query) {
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
        // No list of "dangerous content": the query goes only into the query
        // string of an HTTPS request to the MSP API (axios percent-encodes it)
        // and into matching on the client, where every RegExp built from a
        // query escapes all but its * wildcards. It reaches no SQL, shell,
        // HTML, script, template engine, file path or URL fetch, so the SQL,
        // script, event handler, template, command word, path and protocol
        // patterns that were here guarded nothing, and they refused names such
        // as Cat Feeder, Top Floor, PS 5 and kill switch.
        // Balanced parentheses and brackets outside quoted values, closed
        // quotes, the nesting and length limits, and no control characters:
        // the checks every search tool runs (queryStructureErrors). Counting
        // every ( refused name:"a(b", a value with a parenthesis in it.
        const structuralIssues = queryStructureErrors(trimmedQuery);
        // No check for regex quantifiers: +, {n,m} and ( in a query are
        // escaped before any RegExp is built from it, so they are not
        // quantifiers there. The check refused a phrase with a + and a *
        // ("C++ *") and guarded nothing.
        if (structuralIssues.length > 0) {
            return {
                isValid: false,
                errors: structuralIssues
            };
        }
        // Normalize common patterns for better parsing
        const normalizedQuery = trimmedQuery
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/\s+(AND|OR|NOT)\s+/g, ' $1 ') // Normalize logical operators FIRST (uppercase: and, or and not are words)
            .replace(/\s*:\s*/g, ':') // Remove spaces around colons
            .replace(/\s*>\s*=\s*/g, '>=') // Handle spaced '>='
            .replace(/\s*<\s*=\s*/g, '<=') // Handle spaced '<='
            .replace(/\s*!\s*=\s*/g, '!=') // Handle spaced '!='
            .replace(/\s*(>=|<=|!=|>|<)\s*/g, '$1'); // Remove spaces around operators
        return {
            isValid: true,
            errors: [],
            sanitizedValue: normalizedQuery
        };
    }
    /**
     * Validate and normalize field names for cross-reference queries
     */
    static validateFieldName(fieldName, allowedFields) {
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
    static validateQueryFields(query, entityType) {
        if (!query || typeof query !== 'string') {
            return {
                isValid: false,
                errors: ['Query must be a non-empty string']
            };
        }
        // FieldValidator is now imported at the top of the file
        // Extract field names from the start of each term ("field_name:" or
        // "device.ip:value"). A term runs to the next space or parenthesis outside
        // quotes, so colons inside a value (mac:AA:BB:CC:DD:EE:FF, ip:fe80::1,
        // mac:"aa:bb:cc:00:00:01") are never read as field names.
        // A single quote after a letter, digit or underscore is an apostrophe
        const termPattern = /(?:"(?:[^"\\]|\\.)*"|(?<![\p{L}\p{N}\p{M}_])'(?:[^'\\]|\\.)*'|[^\s()"])+/gu;
        const foundFields = [];
        for (const term of query.match(termPattern) || []) {
            const fieldMatch = /^-?([\w.]+):/.exec(term);
            if (fieldMatch && !foundFields.includes(fieldMatch[1])) {
                foundFields.push(fieldMatch[1]);
            }
        }
        if (foundFields.length === 0) {
            // Check for wildcard-only queries that can cause timeouts
            const trimmedQuery = query.trim();
            // Detect patterns that are essentially wildcard-only or overly broad
            const problematicPatterns = [
                /^\*+$/, // Pure wildcards: "*", "**", etc.
                /^\*\s*$|^\s*\*$/, // Wildcards with whitespace
                /^[*\s]+$/, // Only wildcards and spaces
                /^\*+\s*(AND|OR|NOT)\s*\*+$/, // Multiple wildcards with operators
                /^[*\s()]+$/, // Wildcards, spaces, and parentheses only
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
        const invalidFields = [];
        const suggestions = [];
        // Validate each field. Dot-separated property paths (source.ip, target.type)
        // are native MSP API qualifiers that follow the resource's data model, so the
        // API is the authority on them; only flat names are checked here.
        for (const field of foundFields) {
            if (field.includes('.')) {
                continue;
            }
            const replacement = UNSUPPORTED_QUERY_FIELDS[entityType]?.[field];
            if (replacement) {
                invalidFields.push(field);
                suggestions.push(`${field}: ${replacement}`);
                continue;
            }
            const validation = FieldValidator.validateField(field, entityType);
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
        // Complexity is checked apart (queryComplexityErrors), by every search
        // tool: refused here, it was reported as "invalid field names"
        return {
            isValid: true,
            errors: [],
            sanitizedValue: query
        };
    }
    /**
     * The complexity limits every search tool holds a query to
     * (queryComplexityErrors): each message names the limit, the count and
     * the maximum
     */
    static validateQueryComplexity(query) {
        const errors = typeof query === 'string' && query ? queryComplexityErrors(query) : [];
        return { isValid: errors.length === 0, errors };
    }
}
//# sourceMappingURL=error-handler.js.map