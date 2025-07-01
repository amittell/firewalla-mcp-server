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
    enabled: true,
    toolsUsingLegacyFormat: [
      // Start with empty list - tools will be migrated gradually
      // 'search_flows',
      // 'search_alarms', 
      // 'search_rules',
      // 'get_flow_data',
      // 'get_bandwidth_usage'
    ],
    migrationDeadline: '2024-12-31',
    showDeprecationWarnings: false // Start without warnings to avoid disruption
  },
  
  includeMetadata: {
    executionTime: true,
    cacheStatus: true,
    queryOptimizations: false, // Disable by default to reduce response size
    statisticalSummary: true,
    paginationDetails: true
  },
  
  performance: {
    enableCompression: false, // Disable initially to avoid complexity
    maxResponseSize: 10000, // 10k results before forcing pagination
    enableCaching: true
  }
};

/**
 * Environment-specific configuration overrides
 * 
 * @param environment - Current environment (development, production, test)
 * @returns Environment-specific configuration
 */
export function getEnvironmentConfig(environment: string = 'production'): Partial<ResponseFormatConfig> {
  switch (environment) {
    case 'development':
      return {
        includeMetadata: {
          executionTime: true,
          cacheStatus: true,
          queryOptimizations: true, // Enable in development for debugging
          statisticalSummary: true,
          paginationDetails: true
        },
        legacyCompatibility: {
          enabled: true,
          toolsUsingLegacyFormat: [],
          showDeprecationWarnings: true // Show warnings in development
        }
      };
      
    case 'test':
      return {
        useStandardFormats: true,
        legacyCompatibility: {
          enabled: true,
          toolsUsingLegacyFormat: [],
          showDeprecationWarnings: false // Avoid test noise
        },
        includeMetadata: {
          executionTime: true,
          cacheStatus: false, // Simplify test expectations
          queryOptimizations: false,
          statisticalSummary: false,
          paginationDetails: true
        }
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
export function updateResponseConfig(newConfig: Partial<ResponseFormatConfig>): void {
  currentConfig = {
    ...currentConfig,
    ...newConfig,
    legacyCompatibility: {
      ...currentConfig.legacyCompatibility,
      ...newConfig.legacyCompatibility
    },
    includeMetadata: {
      ...currentConfig.includeMetadata,
      ...newConfig.includeMetadata
    },
    performance: {
      ...currentConfig.performance,
      ...newConfig.performance
    }
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
  const envConfig = getEnvironmentConfig(environment || process.env.NODE_ENV || 'production');
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

/**
 * Add a tool to the legacy format list
 * 
 * @param toolName - Name of the tool to add
 */
export function addLegacyTool(toolName: string): void {
  const config = getResponseConfig();
  
  if (!config.legacyCompatibility.toolsUsingLegacyFormat.includes(toolName)) {
    config.legacyCompatibility.toolsUsingLegacyFormat.push(toolName);
    updateResponseConfig(config);
  }
}

/**
 * Remove a tool from the legacy format list (migrate to standard format)
 * 
 * @param toolName - Name of the tool to remove
 */
export function migrateTool(toolName: string): void {
  const config = getResponseConfig();
  
  const index = config.legacyCompatibility.toolsUsingLegacyFormat.indexOf(toolName);
  if (index > -1) {
    config.legacyCompatibility.toolsUsingLegacyFormat.splice(index, 1);
    updateResponseConfig(config);
  }
}

/**
 * Get migration status for all tools
 * 
 * @returns Object with migration status information
 */
export function getMigrationStatus(): {
  totalTools: number;
  migratedTools: number;
  legacyTools: string[];
  migrationProgress: number;
} {
  const config = getResponseConfig();
  const legacyTools = config.legacyCompatibility.toolsUsingLegacyFormat;
  
  // This would be calculated from the actual tool registry in a real implementation
  const estimatedTotalTools = 25; // Approximate number of tools that could be standardized
  
  return {
    totalTools: estimatedTotalTools,
    migratedTools: estimatedTotalTools - legacyTools.length,
    legacyTools: [...legacyTools],
    migrationProgress: ((estimatedTotalTools - legacyTools.length) / estimatedTotalTools) * 100
  };
}

// Initialize configuration on module load
initializeResponseConfig();