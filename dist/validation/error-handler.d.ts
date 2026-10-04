/**
 * Centralized Error Handling and Validation for Firewalla MCP Server
 * Provides consistent error responses and comprehensive validation utilities
 */
import type { ValidationResult } from '../types.js';
/**
 * Interface for validatable objects
 */
export type ValidatableValue = Record<string, unknown>;
/**
 * Enumeration of specific error types for better error categorization
 */
export declare enum ErrorType {
    VALIDATION_ERROR = "validation_error",
    AUTHENTICATION_ERROR = "authentication_error",
    API_ERROR = "api_error",
    NETWORK_ERROR = "network_error",
    TIMEOUT_ERROR = "timeout_error",
    RATE_LIMIT_ERROR = "rate_limit_error",
    CACHE_ERROR = "cache_error",
    CORRELATION_ERROR = "correlation_error",
    SEARCH_ERROR = "search_error",
    SERVICE_UNAVAILABLE = "service_unavailable",
    TOOL_DISABLED = "tool_disabled",
    UNKNOWN_ERROR = "unknown_error"
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
export declare function createErrorResponse(tool: string, message: string, errorType?: ErrorType, details?: Record<string, unknown>, validationErrors?: string[], context?: StandardError['context']): {
    content: Array<{
        type: string;
        text: string;
    }>;
    isError: true;
};
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
export declare function queryShapeRefusal(tool: string, query: unknown): ReturnType<typeof createErrorResponse> | undefined;
/**
 * Create a legacy error response for backward compatibility
 * @deprecated Use createErrorResponse with ErrorType instead
 */
export declare function createLegacyErrorResponse(tool: string, message: string, details?: Record<string, unknown>, validationErrors?: string[]): {
    content: Array<{
        type: string;
        text: string;
    }>;
    isError: true;
};
/**
 * Wrap a function to ensure consistent error handling
 */
export declare function wrapTool<T extends unknown[], R>(toolName: string, fn: (..._args: T) => Promise<R>): (...args: T) => Promise<R>;
/**
 * Parameter validation utilities
 */
export declare class ParameterValidator {
    /**
     * Validate required string parameter with enhanced null safety
     */
    static validateRequiredString(value: unknown, paramName: string): ValidationResult;
    /**
     * Validate optional string parameter with enhanced null safety
     */
    static validateOptionalString(value: unknown, paramName: string): ValidationResult;
    /**
     * Validate numeric parameter with range checking
     */
    static validateNumber(value: unknown, paramName: string, options?: {
        required?: boolean;
        min?: number;
        max?: number;
        defaultValue?: number;
        integer?: boolean;
    }): ValidationResult;
    /**
     * Validate enum parameter with enhanced null safety
     */
    static validateEnum(value: unknown, paramName: string, allowedValues: string[], required?: boolean, defaultValue?: string): ValidationResult;
    /**
     * Validate boolean parameter with enhanced null safety
     */
    static validateBoolean(value: unknown, paramName: string, defaultValue?: boolean): ValidationResult;
    /**
     * Combine multiple validation results
     */
    static combineValidationResults(results: ValidationResult[]): ValidationResult;
    /**
     * Generate contextual error messages for boundary validation failures
     */
    private static getContextualBoundaryMessage;
    /**
     * Validate date format (ISO 8601) parameter
     */
    static validateDateFormat(value: unknown, paramName: string, required?: boolean): ValidationResult;
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
    static validatePathSegment(value: unknown, paramName: string, { required }?: {
        required?: boolean;
    }): ValidationResult;
    /**
     * Validate Firewalla rule ID format
     */
    static validateRuleId(value: unknown, paramName: string): ValidationResult;
    /**
     * Validate Firewalla alarm ID format
     */
    static validateAlarmId(value: unknown, paramName: string): ValidationResult;
    /**
     * Validate pagination cursor format using enhanced cursor validator
     */
    static validateCursor(value: unknown, paramName: string): ValidationResult;
    /**
     * Get contextual information about parameter usage
     */
    private static getParameterContext;
    /**
     * Validate array parameter with optional constraints
     */
    static validateArray(value: unknown, paramName: string, options?: {
        required?: boolean;
        minLength?: number;
        maxLength?: number;
    }): ValidationResult;
}
/**
 * Enhanced null safety utilities with improved Object conversion prevention
 */
export declare class SafeAccess {
    /**
     * Safely access nested object properties with enhanced null checking.
     * A null or undefined obj gives defaultValue.
     */
    static getNestedValue(obj: ValidatableValue | null | undefined, path: string, defaultValue?: unknown): unknown;
    /**
     * Safely ensure an array with enhanced type checking
     */
    static ensureArray<T>(value: unknown, defaultValue?: T[]): T[];
    /**
     * Safely ensure an object with enhanced null checking
     */
    static ensureObject(value: unknown, defaultValue?: Record<string, unknown>): Record<string, unknown>;
    /**
     * Safely access array with enhanced null checking
     */
    static safeArrayAccess<T>(array: unknown, accessor: (_: T[]) => unknown, defaultValue?: unknown): unknown;
    /**
     * Safely process array with enhanced filtering for null/undefined values
     */
    static safeArrayMap<T, R>(array: unknown, mapper: (_: T, __: number) => R, filter?: (item: T) => boolean): R[];
    /**
     * Safely filter array with enhanced null/undefined checking
     */
    static safeArrayFilter<T>(array: unknown, predicate: (item: T) => boolean): T[];
    /**
     * Enhanced type checking utility to prevent Object conversion errors
     */
    static isValidObject(value: unknown): value is Record<string, unknown>;
    /**
     * Enhanced type checking utility for arrays
     */
    static isValidArray(value: unknown): value is unknown[];
    /**
     * Safe string conversion with null handling
     */
    static safeToString(value: unknown, defaultValue?: string): string;
    /**
     * Safe number conversion with enhanced null handling
     */
    static safeToNumber(value: unknown, defaultValue?: number): number;
}
/**
 * Search query sanitization utilities
 */
export declare class QuerySanitizer {
    /**
     * Sanitize search query to prevent injection attacks and validate basic structure
     */
    static sanitizeSearchQuery(query: string): ValidationResult;
    /**
     * Validate and normalize field names for cross-reference queries
     */
    static validateFieldName(fieldName: string, allowedFields: string[]): ValidationResult;
    /**
     * Validate field names in search queries and provide helpful error messages
     */
    static validateQueryFields(query: string, entityType: string): ValidationResult;
    /**
     * The complexity limits every search tool holds a query to
     * (queryComplexityErrors): each message names the limit, the count and
     * the maximum
     */
    static validateQueryComplexity(query: string): ValidationResult;
}
//# sourceMappingURL=error-handler.d.ts.map