/**
 * Standardized limit configuration for Firewalla MCP Server
 * Centralizes all parameter limits to ensure consistency across tools
 */

/**
 * Standard maximum limits for different types of operations
 */
export const STANDARD_LIMITS = {
  // Basic query limits for standard operations
  BASIC_QUERY: 1000,

  // Search operations (may need more results for analysis)
  SEARCH_FLOWS: 1000,
  SEARCH_ALARMS: 1000, // Standardized down from 5000 to match handlers
  SEARCH_RULES: 1000, // Standardized down from 3000
  SEARCH_DEVICES: 1000, // Standardized down from 2000
  SEARCH_TARGET_LISTS: 1000,

  // Specialized operations
  BANDWIDTH_ANALYSIS: 500, // Lower limit due to heavy data processing
  RULES_SUMMARY: 2000, // Reduced from 10000 for better performance
  OFFLINE_DEVICES: 1000,

  // Statistical operations (typically return fixed amounts)
  STATISTICS: 100,

  // Time-based parameters (not result limits)
  TREND_INTERVAL_SECONDS: 86400, // 24 hours max
} as const;

/**
 * Get the appropriate limit for a specific tool
 */
export function getToolLimit(toolName: string): number {
  const toolLimits: Record<string, number> = {
    // Security tools
    get_active_alarms: 500, // API documented maximum

    // Device tools
    get_device_status: STANDARD_LIMITS.BASIC_QUERY,
    get_offline_devices: STANDARD_LIMITS.OFFLINE_DEVICES,

    // Network tools
    get_flow_data: STANDARD_LIMITS.BASIC_QUERY,
    get_bandwidth_usage: STANDARD_LIMITS.BANDWIDTH_ANALYSIS,

    // Rules tools
    get_network_rules: STANDARD_LIMITS.BASIC_QUERY,
    get_target_lists: STANDARD_LIMITS.BASIC_QUERY,
    get_network_rules_summary: STANDARD_LIMITS.RULES_SUMMARY,

    // Search tools
    search_flows: STANDARD_LIMITS.SEARCH_FLOWS,
    search_alarms: STANDARD_LIMITS.SEARCH_ALARMS,
    search_rules: STANDARD_LIMITS.SEARCH_RULES,
    search_devices: STANDARD_LIMITS.SEARCH_DEVICES,
    search_target_lists: STANDARD_LIMITS.SEARCH_TARGET_LISTS,
  };

  return toolLimits[toolName] || STANDARD_LIMITS.BASIC_QUERY;
}

/**
 * Get the appropriate total timeout for a specific tool based on its complexity
 */
export function getToolTimeout(toolName: string): number {
  const searchTools = [
    'search_flows',
    'search_alarms',
    'search_rules',
    'search_devices',
    'search_target_lists',
  ];

  if (searchTools.includes(toolName) || toolName.includes('search')) {
    return PERFORMANCE_THRESHOLDS.SEARCH_OPERATION_TIMEOUT;
  }

  return PERFORMANCE_THRESHOLDS.SIMPLE_OPERATION_TIMEOUT;
}

/**
 * Validation configuration for common parameter types
 */
export const VALIDATION_CONFIG = {
  LIMIT: {
    min: 1,
    integer: true,
  },

  INTERVAL_SECONDS: {
    min: 60, // Minimum 1 minute intervals
    max: STANDARD_LIMITS.TREND_INTERVAL_SECONDS,
    integer: true,
  },

  CURSOR: {
    // Cursor validation parameters
    maxLength: 1000, // Prevent excessively long cursors
  },

  OFFSET: {
    min: 0,
    integer: true,
  },
} as const;

/**
 * Get validation configuration for a limit parameter
 */
export function getLimitValidationConfig(toolName: string) {
  return {
    ...VALIDATION_CONFIG.LIMIT,
    max: getToolLimit(toolName),
  };
}

/**
 * Performance monitoring thresholds
 */
export const PERFORMANCE_THRESHOLDS = {
  WARNING_MS: 1000, // Log warning if operation takes longer than 1 second
  ERROR_MS: 5000, // Log error if operation takes longer than 5 seconds
  TIMEOUT_MS: 30000, // Hard timeout for all operations (increased to accommodate retries)

  // Timeout budgets for different operation types
  SIMPLE_OPERATION_TIMEOUT: 15000, // 15s for basic operations
  SEARCH_OPERATION_TIMEOUT: 30000, // 30s for search operations

  // Per-attempt timeouts (used within retry loops)
  PER_ATTEMPT_TIMEOUT: 10000, // 10s per individual attempt
  MIN_PER_ATTEMPT_TIMEOUT: 2000, // Minimum 2s per attempt
} as const;
