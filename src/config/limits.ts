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

  // Geographic search operations
  GEOGRAPHIC_FLOWS: 1000,
  GEOGRAPHIC_ALARMS: 1000, // Standardized down from 5000
  GEOGRAPHIC_STATS: 1000,

  // Cross-reference operations (higher limit due to correlation complexity)
  CROSS_REFERENCE: 2000, // Reduced from 5000 for better performance

  // Specialized operations
  BANDWIDTH_ANALYSIS: 500, // Lower limit due to heavy data processing
  RULES_SUMMARY: 2000, // Reduced from 10000 for better performance
  OFFLINE_DEVICES: 1000,

  // Statistical operations (typically return fixed amounts)
  STATISTICS: 100,

  // Time-based parameters (not result limits)
  RULE_PAUSE_DURATION_MINUTES: 1440, // 24 hours max
  TREND_INTERVAL_SECONDS: 86400, // 24 hours max
} as const;

/**
 * Entity-specific limit mappings for tools
 */
export const ENTITY_LIMITS = {
  alarms: STANDARD_LIMITS.SEARCH_ALARMS,
  flows: STANDARD_LIMITS.SEARCH_FLOWS,
  rules: STANDARD_LIMITS.SEARCH_RULES,
  devices: STANDARD_LIMITS.SEARCH_DEVICES,
  target_lists: STANDARD_LIMITS.SEARCH_TARGET_LISTS,
} as const;

/**
 * Performance tier limits based on operation complexity
 */
export const PERFORMANCE_TIER_LIMITS = {
  // Tier 1: Simple data retrieval (fastest)
  SIMPLE: 1000,

  // Tier 2: Data processing and aggregation (moderate)
  MODERATE: 500,

  // Tier 3: Complex correlation and analysis (slower)
  COMPLEX: 200,

  // Tier 4: Statistical analysis (specialized)
  STATISTICAL: 100,
} as const;

/**
 * Get the appropriate limit for a specific tool
 */
export function getToolLimit(toolName: string): number {
  const toolLimits: Record<string, number> = {
    // Security tools
    get_active_alarms: STANDARD_LIMITS.BASIC_QUERY,

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
    get_most_active_rules: STANDARD_LIMITS.BASIC_QUERY,
    get_recent_rules: STANDARD_LIMITS.BASIC_QUERY,

    // Search tools
    search_flows: STANDARD_LIMITS.SEARCH_FLOWS,
    search_alarms: STANDARD_LIMITS.SEARCH_ALARMS,
    search_rules: STANDARD_LIMITS.SEARCH_RULES,
    search_devices: STANDARD_LIMITS.SEARCH_DEVICES,
    search_target_lists: STANDARD_LIMITS.SEARCH_TARGET_LISTS,

    // Geographic search tools
    search_alarms_by_geography: STANDARD_LIMITS.GEOGRAPHIC_ALARMS,
    get_geographic_statistics: STANDARD_LIMITS.GEOGRAPHIC_STATS,

    // Cross-reference tools
    search_cross_reference: STANDARD_LIMITS.CROSS_REFERENCE,
    search_enhanced_cross_reference: STANDARD_LIMITS.CROSS_REFERENCE,
  };

  return toolLimits[toolName] || STANDARD_LIMITS.BASIC_QUERY;
}

/**
 * Get the appropriate performance tier for a tool
 */
export function getToolPerformanceTier(
  toolName: string
): keyof typeof PERFORMANCE_TIER_LIMITS {
  const complexTools = [
    'search_enhanced_cross_reference',
    'search_cross_reference',
    'get_correlation_suggestions',
  ];

  const moderateTools = ['get_bandwidth_usage', 'search_alarms_by_geography'];

  const statisticalTools = [
    'get_simple_statistics',
    'get_statistics_by_region',
    'get_statistics_by_box',
    'get_geographic_statistics',
  ];

  if (complexTools.includes(toolName)) {
    return 'COMPLEX';
  }

  if (moderateTools.includes(toolName)) {
    return 'MODERATE';
  }

  if (statisticalTools.includes(toolName)) {
    return 'STATISTICAL';
  }

  return 'SIMPLE';
}

/**
 * Get the appropriate total timeout for a specific tool based on its complexity
 */
export function getToolTimeout(toolName: string): number {
  const complexTools = [
    'search_enhanced_cross_reference',
    'search_cross_reference',
    'get_correlation_suggestions',
    'search_alarms_by_geography',
    'get_geographic_statistics',
  ];

  const searchTools = [
    'search_flows',
    'search_alarms',
    'search_rules',
    'search_devices',
    'search_target_lists',
  ];

  if (complexTools.includes(toolName)) {
    return PERFORMANCE_THRESHOLDS.COMPLEX_OPERATION_TIMEOUT;
  }

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

  DURATION_MINUTES: {
    min: 1,
    max: STANDARD_LIMITS.RULE_PAUSE_DURATION_MINUTES,
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
  COMPLEX_OPERATION_TIMEOUT: 45000, // 45s for complex correlation/geographic operations

  // Per-attempt timeouts (used within retry loops)
  PER_ATTEMPT_TIMEOUT: 10000, // 10s per individual attempt
  MIN_PER_ATTEMPT_TIMEOUT: 2000, // Minimum 2s per attempt
} as const;
