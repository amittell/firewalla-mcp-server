/**
 * Standardized limit configuration for Firewalla MCP Server
 * Centralizes all parameter limits to ensure consistency across tools
 */
/**
 * Standard maximum limits for different types of operations
 */
export declare const STANDARD_LIMITS: {
    readonly BASIC_QUERY: 1000;
    readonly SEARCH_FLOWS: 1000;
    readonly SEARCH_ALARMS: 1000;
    readonly SEARCH_RULES: 1000;
    readonly SEARCH_DEVICES: 1000;
    readonly SEARCH_TARGET_LISTS: 1000;
    readonly BANDWIDTH_ANALYSIS: 500;
    readonly RULES_SUMMARY: 2000;
    readonly OFFLINE_DEVICES: 1000;
    readonly STATISTICS: 100;
    readonly TREND_INTERVAL_SECONDS: 86400;
};
/**
 * Get the appropriate limit for a specific tool
 */
export declare function getToolLimit(toolName: string): number;
/**
 * Get the appropriate total timeout for a specific tool based on its complexity
 */
export declare function getToolTimeout(toolName: string): number;
/**
 * Validation configuration for common parameter types
 */
export declare const VALIDATION_CONFIG: {
    readonly LIMIT: {
        readonly min: 1;
        readonly integer: true;
    };
    readonly INTERVAL_SECONDS: {
        readonly min: 60;
        readonly max: 86400;
        readonly integer: true;
    };
    readonly CURSOR: {
        readonly maxLength: 1000;
    };
    readonly OFFSET: {
        readonly min: 0;
        readonly integer: true;
    };
};
/**
 * Get validation configuration for a limit parameter
 */
export declare function getLimitValidationConfig(toolName: string): {
    max: number;
    min: 1;
    integer: true;
};
/**
 * Performance monitoring thresholds
 */
export declare const PERFORMANCE_THRESHOLDS: {
    readonly WARNING_MS: 1000;
    readonly ERROR_MS: 5000;
    readonly TIMEOUT_MS: 30000;
    readonly SIMPLE_OPERATION_TIMEOUT: 15000;
    readonly SEARCH_OPERATION_TIMEOUT: 30000;
    readonly PER_ATTEMPT_TIMEOUT: 10000;
    readonly MIN_PER_ATTEMPT_TIMEOUT: 2000;
};
//# sourceMappingURL=limits.d.ts.map