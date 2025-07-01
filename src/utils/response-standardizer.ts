/**
 * Response standardization utilities
 * 
 * Provides consistent response formatting across all MCP tools while maintaining
 * backward compatibility through configuration-based format selection.
 */

import type {
  StandardSearchResponse,
  StandardPaginatedResponse,
  StandardStatisticalResponse,
  SearchMetadata,
  PaginationMetadata,
  StatisticalMetadata,
  ResponseCategory
} from '../types/standard-responses.js';

/**
 * Response standardizer class providing unified formatting utilities
 */
export class ResponseStandardizer {
  
  /**
   * Convert data and metadata to standardized search response format
   * 
   * @param data - Array of search results
   * @param metadata - Search operation metadata
   * @returns Standardized search response
   */
  static toSearchResponse<T>(
    data: T[], 
    metadata: SearchMetadata
  ): StandardSearchResponse<T> {
    return {
      results: data,
      count: data.length,
      query_executed: metadata.query,
      entity_type: metadata.entityType,
      execution_time_ms: metadata.executionTime,
      cached: metadata.cached || false,
      pagination: metadata.cursor || metadata.hasMore !== undefined ? {
        cursor: metadata.cursor,
        has_more: metadata.hasMore || false,
        limit_applied: metadata.limit || data.length,
        offset: undefined
      } : undefined,
      search_metadata: {
        total_possible_results: metadata.totalPossible,
        search_strategy: metadata.strategy,
        optimizations_applied: metadata.optimizations,
        query_complexity: this.determineQueryComplexity(metadata.query)
      },
      aggregations: metadata.aggregations
    };
  }
  
  /**
   * Convert data and metadata to standardized paginated response format
   * 
   * @param data - Array of paginated results
   * @param metadata - Pagination operation metadata
   * @returns Standardized paginated response
   */
  static toPaginatedResponse<T>(
    data: T[],
    metadata: PaginationMetadata
  ): StandardPaginatedResponse<T> {
    return {
      results: data,
      count: data.length,
      pagination: {
        cursor: metadata.cursor,
        has_more: metadata.hasMore,
        limit_applied: metadata.limit,
        offset: metadata.offset
      },
      execution_time_ms: metadata.executionTime,
      cached: metadata.cached || false,
      data_source: metadata.source,
      query_parameters: metadata.queryParams,
      total_count: metadata.totalCount
    };
  }
  
  /**
   * Convert data and metadata to standardized statistical response format
   * 
   * @param data - Array of statistical results
   * @param metadata - Statistical analysis metadata
   * @returns Standardized statistical response
   */
  static toStatisticalResponse<T>(
    data: T[],
    metadata: StatisticalMetadata
  ): StandardStatisticalResponse<T> {
    return {
      results: data,
      count: data.length,
      analysis: {
        period: metadata.period,
        start_time: metadata.startTime,
        end_time: metadata.endTime,
        total_analyzed: metadata.totalAnalyzed,
        criteria: metadata.criteria
      },
      execution_time_ms: metadata.executionTime,
      cached: metadata.cached || false,
      statistics: metadata.statistics
    };
  }
  
  /**
   * Determine query complexity based on query string analysis
   * 
   * @param query - Query string to analyze
   * @returns Complexity level
   * @private
   */
  private static determineQueryComplexity(query: string): 'simple' | 'medium' | 'complex' {
    if (!query) return 'simple';
    
    const operatorCount = (query.match(/\s+(AND|OR|NOT)\s+/gi) || []).length;
    const wildcardCount = (query.match(/\*/g) || []).length;
    const parenthesesCount = (query.match(/[()]/g) || []).length;
    
    if (operatorCount >= 3 || parenthesesCount >= 2 || wildcardCount >= 3) {
      return 'complex';
    } else if (operatorCount >= 1 || wildcardCount >= 1 || parenthesesCount >= 1) {
      return 'medium';
    }
    
    return 'simple';
  }
}

/**
 * Backward compatibility layer for gradual migration to standard formats
 */
export class BackwardCompatibilityLayer {
  
  /**
   * Convert standardized search response to legacy format for specific tools
   * 
   * @param standardResponse - Standardized search response
   * @param toolName - Name of the tool requesting legacy format
   * @returns Legacy formatted response or standard response if no legacy format defined
   */
  static toLegacySearchFormat(
    standardResponse: StandardSearchResponse<any>,
    toolName: string
  ): any {
    // Legacy formats mapped by tool name
    const legacyFormats: Record<string, (response: StandardSearchResponse<any>) => any> = {
      'search_flows': (response) => ({
        flows: response.results,
        count: response.count,
        query_executed: response.query_executed,
        execution_time_ms: response.execution_time_ms,
        aggregations: response.aggregations
      }),
      
      'search_alarms': (response) => ({
        alarms: response.results,
        count: response.count,
        query_executed: response.query_executed,
        execution_time_ms: response.execution_time_ms,
        aggregations: response.aggregations
      }),
      
      'search_rules': (response) => ({
        rules: response.results,
        count: response.count,
        query_executed: response.query_executed,
        execution_time_ms: response.execution_time_ms,
        aggregations: response.aggregations
      }),
      
      'search_devices': (response) => ({
        devices: response.results,
        count: response.count,
        query_executed: response.query_executed,
        execution_time_ms: response.execution_time_ms,
        aggregations: response.aggregations
      }),
      
      'search_target_lists': (response) => ({
        target_lists: response.results,
        count: response.count,
        query_executed: response.query_executed,
        execution_time_ms: response.execution_time_ms,
        aggregations: response.aggregations
      })
    };
    
    const formatter = legacyFormats[toolName];
    return formatter ? formatter(standardResponse) : standardResponse;
  }
  
  /**
   * Convert standardized paginated response to legacy format for specific tools
   * 
   * @param standardResponse - Standardized paginated response
   * @param toolName - Name of the tool requesting legacy format
   * @returns Legacy formatted response or standard response if no legacy format defined
   */
  static toLegacyPaginatedFormat(
    standardResponse: StandardPaginatedResponse<any>,
    toolName: string
  ): any {
    const legacyFormats: Record<string, (response: StandardPaginatedResponse<any>) => any> = {
      'get_flow_data': (response) => ({
        count: response.count,
        flows: response.results,
        next_cursor: response.pagination.cursor,
        // Keep legacy field structure for backward compatibility
        ...response.query_parameters
      }),
      
      'get_active_alarms': (response) => ({
        count: response.count,
        results: response.results,
        cursor: response.pagination.cursor
      })
    };
    
    const formatter = legacyFormats[toolName];
    return formatter ? formatter(standardResponse) : standardResponse;
  }
  
  /**
   * Convert standardized statistical response to legacy format for specific tools
   * 
   * @param standardResponse - Standardized statistical response
   * @param toolName - Name of the tool requesting legacy format
   * @returns Legacy formatted response or standard response if no legacy format defined
   */
  static toLegacyStatisticalFormat(
    standardResponse: StandardStatisticalResponse<any>,
    toolName: string
  ): any {
    const legacyFormats: Record<string, (response: StandardStatisticalResponse<any>) => any> = {
      'get_bandwidth_usage': (response) => ({
        period: response.analysis.period,
        top_devices: response.results,
        count: response.count,
        execution_time_ms: response.execution_time_ms
      }),
      
      'get_most_active_rules': (response) => ({
        rules: response.results,
        total_count: response.count,
        analysis_period: response.analysis.period,
        execution_time_ms: response.execution_time_ms
      })
    };
    
    const formatter = legacyFormats[toolName];
    return formatter ? formatter(standardResponse) : standardResponse;
  }
  
  /**
   * Detect if a tool should use legacy format based on configuration
   * 
   * @param toolName - Name of the tool
   * @returns True if legacy format should be used
   */
  static shouldUseLegacyFormat(toolName: string): boolean {
    const config = this.getCompatibilityConfig();
    
    // Check if legacy compatibility is enabled globally
    if (!config.legacyCompatibility.enabled) {
      return false;
    }
    
    // Check if this specific tool is in the legacy format list
    return config.legacyCompatibility.toolsUsingLegacyFormat.includes(toolName);
  }
  
  /**
   * Get backward compatibility configuration
   * This would typically load from a configuration file or environment
   * 
   * @returns Compatibility configuration
   * @private
   */
  private static getCompatibilityConfig() {
    // For now, return a default configuration
    // In a real implementation, this would load from config files
    return {
      legacyCompatibility: {
        enabled: true,
        toolsUsingLegacyFormat: [] as string[], // Start with empty list for gradual migration
        migrationDeadline: '2024-12-31'
      }
    };
  }
}

/**
 * Utility functions for response format detection and conversion
 */
export class ResponseFormatUtils {
  
  /**
   * Detect the category of response based on content and tool name
   * 
   * @param toolName - Name of the tool
   * @param responseData - Response data to analyze
   * @returns Detected response category
   */
  static detectResponseCategory(toolName: string, responseData: any): ResponseCategory {
    // Correlation tools pattern
    if (toolName.includes('correlation') || toolName.includes('cross_reference')) {
      return 'correlation';
    }
    
    // Search tools pattern (check after correlation to avoid conflicts)
    if (toolName.startsWith('search_')) {
      return 'search';
    }
    
    // Statistical tools pattern
    if (toolName.includes('bandwidth') || toolName.includes('statistics') || 
        toolName.includes('trends') || toolName.includes('most_active')) {
      return 'statistical';
    }
    
    // Paginated tools pattern (has cursor or pagination metadata)
    if (responseData?.next_cursor !== undefined || responseData?.cursor !== undefined ||
        responseData?.pagination !== undefined) {
      return 'paginated';
    }
    
    // Default to search category for unknown patterns
    return 'search';
  }
  
  /**
   * Check if a response follows the standard format
   * 
   * @param response - Response to check
   * @param category - Expected response category
   * @returns True if response follows standard format
   */
  static isStandardFormat(response: any, category: ResponseCategory): boolean {
    const hasResults = Array.isArray(response.results);
    const hasCount = typeof response.count === 'number';
    const hasExecutionTime = typeof response.execution_time_ms === 'number';
    
    const baseStandard = hasResults && hasCount && hasExecutionTime;
    
    switch (category) {
      case 'search':
        return baseStandard && 
               typeof response.query_executed === 'string' && 
               typeof response.entity_type === 'string';
               
      case 'paginated':
        return baseStandard && 
               response.pagination !== undefined &&
               typeof response.data_source === 'string';
               
      case 'statistical':
        return baseStandard && 
               response.analysis !== undefined &&
               typeof response.analysis.period === 'string';
               
      case 'correlation':
        return response.primary !== undefined && 
               Array.isArray(response.correlations) &&
               response.correlation_summary !== undefined;
               
      default:
        return false;
    }
  }
}