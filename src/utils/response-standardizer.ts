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
  ResponseCategory,
} from '../types.js';

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
      pagination:
        metadata.cursor || metadata.hasMore !== undefined
          ? {
              cursor: metadata.cursor,
              has_more: metadata.hasMore || false,
              limit_applied: metadata.limit || data.length,
              offset: undefined,
            }
          : undefined,
      search_metadata: {
        total_possible_results: metadata.totalPossible,
        search_strategy: metadata.strategy,
        optimizations_applied: metadata.optimizations,
        query_complexity: this.determineQueryComplexity(metadata.query),
      },
      aggregations: metadata.aggregations,
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
        offset: metadata.offset,
      },
      execution_time_ms: metadata.executionTime,
      cached: metadata.cached || false,
      data_source: metadata.source,
      query_parameters: metadata.queryParams,
      total_count: metadata.totalCount,
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
        criteria: metadata.criteria,
      },
      execution_time_ms: metadata.executionTime,
      cached: metadata.cached || false,
      statistics: metadata.statistics,
    };
  }

  /**
   * Determine query complexity based on query string analysis
   *
   * @param query - Query string to analyze
   * @returns Complexity level
   * @private
   */
  private static determineQueryComplexity(
    query: string
  ): 'simple' | 'medium' | 'complex' {
    if (!query) {
      return 'simple';
    }

    const operatorCount = (query.match(/\s+(AND|OR|NOT)\s+/gi) || []).length;
    const wildcardCount = (query.match(/\*/g) || []).length;
    const parenthesesCount = (query.match(/[()]/g) || []).length;

    if (operatorCount >= 3 || parenthesesCount >= 2 || wildcardCount >= 3) {
      return 'complex';
    } else if (
      operatorCount >= 1 ||
      wildcardCount >= 1 ||
      parenthesesCount >= 1
    ) {
      return 'medium';
    }

    return 'simple';
  }
}

// BackwardCompatibilityLayer removed - greenfield project uses standard responses only

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
  static detectResponseCategory(
    toolName: string,
    responseData: any
  ): ResponseCategory {
    // Correlation tools pattern
    if (
      toolName.includes('correlation') ||
      toolName.includes('cross_reference')
    ) {
      return 'correlation';
    }

    // Search tools pattern (check after correlation to avoid conflicts)
    if (toolName.startsWith('search_')) {
      return 'search';
    }

    // Statistical tools pattern
    if (
      toolName.includes('bandwidth') ||
      toolName.includes('statistics') ||
      toolName.includes('trends') ||
      toolName.includes('most_active')
    ) {
      return 'statistical';
    }

    // Paginated tools pattern (has cursor or pagination metadata)
    if (
      responseData?.next_cursor !== undefined ||
      responseData?.cursor !== undefined ||
      responseData?.pagination !== undefined
    ) {
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
        return (
          baseStandard &&
          typeof response.query_executed === 'string' &&
          typeof response.entity_type === 'string'
        );

      case 'paginated':
        return (
          baseStandard &&
          response.pagination !== undefined &&
          typeof response.data_source === 'string'
        );

      case 'statistical':
        return (
          baseStandard &&
          response.analysis !== undefined &&
          typeof response.analysis.period === 'string'
        );

      case 'correlation':
        return (
          response.primary !== undefined &&
          Array.isArray(response.correlations) &&
          response.correlation_summary !== undefined
        );

      case 'status':
        return baseStandard; // Simple status responses just need basic fields

      default:
        return false;
    }
  }
}
