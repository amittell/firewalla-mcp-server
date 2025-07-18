/**
 * Response format configuration for gradual migration to standardized formats
 *
 * This configuration allows for controlled rollout of response format standardization
 * while maintaining backward compatibility for existing integrations.
 */

/**
 * Response format configuration interface
 */
export interface ResponseFormatConfig {
  /** Enable standardized response formats globally */
  useStandardFormats: boolean;

  /** Legacy compatibility settings */
  legacyCompatibility: {
    /** Enable legacy format support */
    enabled: boolean;

    /** List of tools that should continue using legacy formats */
    toolsUsingLegacyFormat: string[];

    /** Migration deadline (after which legacy support may be removed) */
    migrationDeadline?: string;

    /** Warnings for deprecated formats */
    showDeprecationWarnings: boolean;
  };

  /** Metadata inclusion settings */
  includeMetadata: {
    /** Include execution timing information */
    executionTime: boolean;

    /** Include cache status information */
    cacheStatus: boolean;

    /** Include query optimization details */
    queryOptimizations: boolean;

    /** Include statistical summary information */
    statisticalSummary: boolean;

    /** Include pagination metadata */
    paginationDetails: boolean;
  };

  /** Performance settings */
  performance: {
    /** Enable response compression for large datasets */
    enableCompression: boolean;

    /** Maximum response size before pagination is enforced */
    maxResponseSize: number;

    /** Enable response caching */
    enableCaching: boolean;
  };
}

/**
 * Default response format configuration
 *
 * Starts with a conservative approach: enable standards but maintain legacy compatibility
 * for a smooth migration path.
 */
export const DEFAULT_RESPONSE_CONFIG: ResponseFormatConfig = {
  useStandardFormats: true,

  legacyCompatibility: {
    enabled: false, // Wave 1: Disable legacy compatibility for greenfield project
    toolsUsingLegacyFormat: [],
    migrationDeadline: '2024-12-31',
    showDeprecationWarnings: false,
  },

  includeMetadata: {
    executionTime: true,
    cacheStatus: true,
    queryOptimizations: false, // Disable by default to reduce response size
    statisticalSummary: true,
    paginationDetails: true,
  },

  performance: {
    enableCompression: false, // Disable initially to avoid complexity
    maxResponseSize: 10000, // 10k results before forcing pagination
    enableCaching: true,
  },
};

/**
 * Environment-specific configuration overrides
 *
 * @param environment - Current environment (development, production, test)
 * @returns Environment-specific configuration
 */
export function getEnvironmentConfig(
  environment: string = 'production'
): Partial<ResponseFormatConfig> {
  switch (environment) {
    case 'development':
      return {
        includeMetadata: {
          executionTime: true,
          cacheStatus: true,
          queryOptimizations: true, // Enable in development for debugging
          statisticalSummary: true,
          paginationDetails: true,
        },
        legacyCompatibility: {
          enabled: false, // Wave 1: Disable legacy compatibility everywhere
          toolsUsingLegacyFormat: [],
          showDeprecationWarnings: false,
        },
      };

    case 'test':
      return {
        useStandardFormats: true,
        legacyCompatibility: {
          enabled: false, // Wave 1: Disable legacy compatibility in tests too
          toolsUsingLegacyFormat: [],
          showDeprecationWarnings: false,
        },
        includeMetadata: {
          executionTime: true,
          cacheStatus: false, // Simplify test expectations
          queryOptimizations: false,
          statisticalSummary: false,
          paginationDetails: true,
        },
      };

    case 'production':
    default:
      return {}; // Use defaults for production
  }
}

/**
 * Current runtime configuration
 * Initialized with defaults and can be updated at runtime
 */
let currentConfig: ResponseFormatConfig = { ...DEFAULT_RESPONSE_CONFIG };

/**
 * Update response format configuration at runtime
 *
 * @param newConfig - Partial configuration to merge with current settings
 */
export function updateResponseConfig(
  newConfig: Partial<ResponseFormatConfig>
): void {
  currentConfig = {
    ...currentConfig,
    ...newConfig,
    legacyCompatibility: {
      ...currentConfig.legacyCompatibility,
      ...newConfig.legacyCompatibility,
    },
    includeMetadata: {
      ...currentConfig.includeMetadata,
      ...newConfig.includeMetadata,
    },
    performance: {
      ...currentConfig.performance,
      ...newConfig.performance,
    },
  };
}

/**
 * Get current response format configuration
 *
 * @returns Current configuration
 */
export function getResponseConfig(): ResponseFormatConfig {
  return { ...currentConfig };
}

/**
 * Initialize configuration from environment variables
 *
 * @param environment - Environment name
 */
export function initializeResponseConfig(environment?: string): void {
  const envConfig = getEnvironmentConfig(
    environment || process.env.NODE_ENV || 'production'
  );
  updateResponseConfig(envConfig);
}

/**
 * Check if a specific tool should use legacy format
 *
 * @param toolName - Name of the tool
 * @returns True if tool should use legacy format
 */
export function shouldUseLegacyFormat(toolName: string): boolean {
  const config = getResponseConfig();

  if (!config.legacyCompatibility.enabled) {
    return false;
  }

  return config.legacyCompatibility.toolsUsingLegacyFormat.includes(toolName);
}

// Legacy migration functions removed - greenfield project uses standard responses only

// Initialize configuration on module load
initializeResponseConfig();
