/**
 * Response standardization utilities
 *
 * Provides consistent response formatting across all MCP tools.
 */

import type {
  StandardSearchResponse,
  StandardPaginatedResponse,
  StandardStatisticalResponse,
  SearchMetadata,
  PaginationMetadata,
  StatisticalMetadata,
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

    // Uppercase only, as toMspQuery reads operators
    const operatorCount = (query.match(/\s+(AND|OR|NOT)\s+/g) || []).length;
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
