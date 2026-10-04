/**
 * Parameter Sanitization Utilities for Firewalla MCP Server
 * Provides early sanitization to prevent null/undefined from reaching Object operations
 */
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
export declare class ParameterSanitizationError extends Error {
    readonly errors: string[];
    readonly originalArgs: unknown;
    constructor(errors: string[], originalArgs: unknown);
}
/**
 * Early parameter sanitizer to prevent null/undefined from reaching Object operations
 */
export declare class ParameterSanitizer {
    /**
     * Sanitize parameters early in the validation pipeline
     *
     * @param args - Raw arguments from MCP client
     * @param config - Sanitization configuration
     * @returns Sanitization result with cleaned parameters
     */
    static sanitizeParameters(args: unknown, config?: Partial<SanitizationConfig>): ParameterSanitizationResult;
    /**
     * Safely sanitize an object without risking Object operations on null/undefined
     */
    private static sanitizeObject;
    /**
     * Sanitize individual parameter values
     */
    private static sanitizeValue;
    /**
     * Check if a string represents a valid number
     */
    private static isNumericString;
    /**
     * Create error response for sanitization failures
     */
    static createSanitizationErrorResponse(toolName: string, sanitizationResult: ParameterSanitizationResult): {
        content: Array<{
            type: string;
            text: string;
        }>;
        isError: true;
    };
    /**
     * Safe wrapper for Object operations that might receive null/undefined
     */
    static safeObjectEntries(obj: unknown): Array<[string, unknown]>;
    /**
     * Safe wrapper for Object.keys that might receive null/undefined
     */
    static safeObjectKeys(obj: unknown): string[];
    /**
     * Safe wrapper for Object.values that might receive null/undefined
     */
    static safeObjectValues(obj: unknown): unknown[];
}
/**
 * Convenient function to validate and sanitize parameters in one step
 */
export declare function validateAndSanitizeParameters(args: unknown, toolName: string, config?: Partial<SanitizationConfig>): {
    sanitizedArgs: ToolArgs;
} | {
    errorResponse: any;
};
//# sourceMappingURL=parameter-sanitizer.d.ts.map